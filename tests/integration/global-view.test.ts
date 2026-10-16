import { delimiter } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInventory } from "../../src/application/inventory.js";
import type { Environment, Filesystem } from "../../src/core/ports.js";
import { findCommands } from "../../src/scanners/path-lookup.js";
import { config, fakeHttp, fakeRunner, memoryFs, netContext, ok, p } from "../helpers/fakes.js";

/**
 * The global view beyond pnpm (docs/providers/npm.md, docs/providers/path.md):
 * npm global prefixes and developer tools on PATH. The layouts are the ones
 * npm leaves on the platform the test runs on, so CI checks both.
 */
const windows = process.platform === "win32";
const HOME = "/home/me";

const NPM_LAUNCHER = (script: string) =>
  [
    "@ECHO off",
    "GOTO start",
    ":find_dp0",
    "SET dp0=%~dp0",
    "EXIT /b",
    ":start",
    "SETLOCAL",
    "CALL :find_dp0",
    'IF EXIST "%dp0%\\node.exe" (',
    '  SET "_prog=%dp0%\\node.exe"',
    ") ELSE (",
    '  SET "_prog=node"',
    "  SET PATHEXT=%PATHEXT:;.JS;=;%",
    ")",
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${script}" %*`,
  ].join("\r\n");

interface World {
  files: Record<string, string>;
  executables: string[];
  symlinks: Record<string, string>;
  path: string[];
}

const empty = (): World => ({ files: {}, executables: [], symlinks: {}, path: [] });

/** An npm global prefix as npm leaves it here, added to the end of PATH. */
function npmPrefix(
  world: World,
  prefix: string,
  packages: Record<string, { version?: string; bin?: string; broken?: boolean; link?: string }>,
): string {
  const modules = windows ? `${prefix}/node_modules` : `${prefix}/lib/node_modules`;
  const binDir = windows ? prefix : `${prefix}/bin`;
  world.path.push(binDir);
  for (const [name, pkg] of Object.entries(packages)) {
    const dir = `${modules}/${name}`;
    const manifest = JSON.stringify({
      name,
      ...(pkg.version ? { version: pkg.version } : {}),
      ...(pkg.bin ? { bin: { [pkg.bin]: "cli.js" } } : {}),
    });
    world.files[`${dir}/package.json`] = manifest;
    if (pkg.link) {
      world.symlinks[dir] = pkg.link;
      world.files[`${pkg.link}/package.json`] = manifest;
    }
    if (!pkg.bin) continue;
    if (!pkg.broken) world.files[`${dir}/cli.js`] = "";
    if (windows) {
      const shim = `${binDir}/${pkg.bin}.cmd`;
      world.files[shim] = NPM_LAUNCHER(`node_modules\\${name.replace("/", "\\")}\\cli.js`);
      world.executables.push(shim);
    } else {
      world.symlinks[`${binDir}/${pkg.bin}`] = `${dir}/cli.js`;
    }
  }
  return modules;
}

/** A command file as the platform names it. */
const command = (dirPath: string, name: string) =>
  windows ? `${dirPath}/${name}.EXE` : `${dirPath}/${name}`;

function run(world: World, options: { online?: boolean } = {}) {
  const fs = memoryFs(world.files, { executables: world.executables, symlinks: world.symlinks });
  const env: Environment = {
    platform: process.platform,
    homeDir: p(HOME),
    get: (name) =>
      name === "PATH"
        ? world.path.map(p).join(delimiter)
        : name === "PATHEXT"
          ? ".EXE;.CMD"
          : undefined,
  };
  const http = fakeHttp({});
  // No pnpm: only what this test lays out is found.
  const runner = fakeRunner({});
  return {
    http,
    runner,
    inventory: buildInventory(
      {
        fs,
        runner,
        env,
        net: netContext(options.online ? http : undefined),
        config: config(),
        cwd: "/tmp",
      },
      { globalOnly: true },
    ),
  };
}

describe("npm global packages (docs/providers/npm.md)", () => {
  it("lists every prefix in PATH: the first one's packages by name, the others by path", async () => {
    const world = empty();
    npmPrefix(world, "/home/me/fnm/v22", {
      "@anthropic-ai/claude-code": { version: "2.1.280", bin: "claude" },
      "is-number": { version: "6.0.0" },
    });
    const old = npmPrefix(world, "/home/me/AppData/Roaming/npm", {
      "@anthropic-ai/claude-code": { version: "2.0.0", bin: "claude" },
    });
    const { inventory, http } = run(world, { online: true });
    const inv = await inventory;
    const claude = inv.tools.filter((t) => t.name === "@anthropic-ai/claude-code");
    expect(claude.map((t) => t.id)).toEqual([
      "global:npm:@anthropic-ai/claude-code",
      `global:npm:${p(`${old}/@anthropic-ai/claude-code`)}`,
    ]);
    expect(claude[0]).toMatchObject({
      versions: {
        installed: { state: "known", value: "2.1.280", confidence: "high" },
        latest: { state: "unknown", reason: expect.stringContaining("npm keeps no record") },
      },
      // The prefix layout and the command that runs the package: two inferences.
      installation: { state: "known", value: { provider: "npm" }, confidence: "medium" },
    });
    // Without a command, only the layout says npm installed it.
    expect(inv.tools.find((t) => t.name === "is-number")?.installation).toMatchObject({
      confidence: "low",
    });
    // Where a global package came from is never known: nothing is queried.
    expect(http.calls).toEqual([]);
    expect(inv.diagnostics.filter((d) => d.message.includes("share the id"))).toEqual([]);
  });

  it("says when a launcher runs a file that does not exist, and only then", async () => {
    // On Windows npm writes a .cmd launcher, which can name a missing file.
    // Elsewhere it writes a link; a dangling one reads as no command at all.
    const world = empty();
    npmPrefix(world, "/home/me/npm", {
      "@anthropic-ai/claude-code": { version: "2.0.0", bin: "claude", broken: windows },
      "is-number": { version: "6.0.0", bin: "is-number" },
    });
    const inv = await run(world).inventory;
    const claude = inv.tools.find((t) => t.name === "@anthropic-ai/claude-code");
    const warnings = inv.diagnostics.filter((d) => d.message.includes("cannot start"));
    expect(warnings).toEqual(
      windows
        ? [expect.objectContaining({ severity: "warning", source: "npm", toolId: claude?.id })]
        : [],
    );
    expect(warnings[0]?.message ?? "claude cannot start").toContain("claude cannot start");
  });

  it("does not take a node_modules some program left in a PATH directory as a prefix", async () => {
    // C:\Windows\System32 can have one: packages without commands there.
    const world = empty();
    npmPrefix(world, "/home/me/System32", { "pdf-lib": { version: "1.17.1" }, tslib: {} });
    const inv = await run(world).inventory;
    expect(inv.tools).toEqual([]);
  });

  it("reports nothing else from a prefix's bin directory", async () => {
    const world = empty();
    npmPrefix(world, "/usr/local", { "is-number": { version: "6.0.0", bin: "is-number" } });
    world.executables.push(command(windows ? "/usr/local" : "/usr/local/bin", "unrelated"));
    const inv = await run(world).inventory;
    expect(inv.tools.map((t) => t.name)).toEqual(["is-number"]);
  });

  it("never queries a package linked with npm link", async () => {
    const world = empty();
    npmPrefix(world, "/home/me/npm", {
      mine: { version: "1.0.0", link: "/home/me/src/mine" },
      npm: { version: "11.0.0", bin: "npm" },
    });
    const inv = await run(world, { online: true }).inventory;
    expect(inv.tools.find((t) => t.name === "mine")?.versions.latest).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("a link to"),
    });
  });
});

describe("developer tools on PATH (docs/providers/path.md)", () => {
  it("reads versions from the files that state them, and runs nothing", async () => {
    const world = empty();
    const git = "/opt/Git";
    world.executables.push(command(`${git}/cmd`, "git"));
    world.files[`${git}/ReleaseNotes.html`] = "<h2>Git for Windows v2.55.0 Release Notes</h2>";
    world.executables.push(command("/usr/local/bin", "node"));
    world.files["/usr/local/include/node/node_version.h"] = [
      "#define NODE_MAJOR_VERSION 22",
      "#define NODE_MINOR_VERSION 23",
      "#define NODE_PATCH_VERSION 3",
    ].join("\n");
    world.executables.push(command("/opt/go/bin", "go"));
    world.files["/opt/go/VERSION"] = "go1.22.5\ntime 2024-06-04T20:32:22Z\n";
    world.executables.push(command("/opt/jdk/bin", "java"));
    world.files["/opt/jdk/release"] = 'IMPLEMENTOR="Eclipse Adoptium"\nJAVA_VERSION="21.0.2"\n';
    world.executables.push(command("/opt/docker/bin", "docker"));
    world.path.push(
      `${git}/cmd`,
      "/usr/local/bin",
      "/opt/go/bin",
      "/opt/jdk/bin",
      "/opt/docker/bin",
    );
    const { inventory, runner } = run(world);
    const inv = await inventory;
    const byName = (name: string) => inv.tools.find((t) => t.name === name);

    expect(byName("git")?.versions.installed).toMatchObject({
      value: "2.55.0",
      confidence: "low",
    });
    expect(byName("node")?.versions.installed).toMatchObject({
      value: "22.23.3",
      confidence: "high",
    });
    expect(byName("go")?.versions.installed).toMatchObject({ value: "1.22.5", confidence: "high" });
    expect(byName("java")?.versions.installed).toMatchObject({
      value: "21.0.2",
      confidence: "high",
    });
    expect(byName("docker")?.versions.installed).toMatchObject({
      state: "unknown",
      reason: "actually does not run it, and no file states its version",
    });
    for (const name of ["git", "node", "go", "java", "docker"]) {
      expect(byName(name)).toMatchObject({
        id: `global:unknown:${name}`,
        versions: {
          latest: { state: "unknown", reason: "no source declares a latest version for it" },
        },
        installation: {
          state: "unknown",
          reason: "installed outside any supported package manager",
        },
      });
    }
    // Only pnpm's allowlisted commands are tried; no tool found is run.
    expect(new Set(runner.calls.map((c) => c.command.split(".")[0]))).toEqual(new Set(["pnpm"]));
  });

  it("takes a version from a version manager's directory name, as an inference", async () => {
    const world = empty();
    const node = `${HOME}/AppData/Roaming/fnm/node-versions/v22.23.2/installation`;
    world.executables.push(command(node, "node"));
    world.path.push(node);
    const inv = await run(world).inventory;
    expect(inv.tools.find((t) => t.name === "node")?.versions.installed).toMatchObject({
      value: "22.23.2",
      confidence: "low",
    });
  });

  it("never says an app execution alias is an installed tool", async () => {
    const world = empty();
    const aliases = `${HOME}/AppData/Local/Microsoft/WindowsApps`;
    world.executables.push(command(aliases, "python"));
    world.path.push(aliases);
    const inv = await run(world).inventory;
    expect(inv.tools.find((t) => t.name === "python")?.versions.installed).toMatchObject({
      state: "unknown",
      reason: expect.stringContaining("Microsoft Store"),
    });
  });

  it("is not a second tool when an npm package already provides it", async () => {
    const world = empty();
    npmPrefix(world, "/home/me/npm", { deno: { version: "2.0.0", bin: "deno" } });
    const inv = await run(world).inventory;
    expect(inv.tools.filter((t) => t.name === "deno").map((t) => t.id)).toEqual([
      "global:npm:deno",
    ]);
  });

  it("is not a second tool when a link elsewhere in PATH runs an npm package", async () => {
    const world = empty();
    const modules = npmPrefix(world, "/home/me/npm", {
      deno: { version: "2.0.0" },
      npm: { version: "11.0.0", bin: "npm" },
    });
    world.files[`${modules}/deno/cli.js`] = "";
    world.symlinks[command("/opt/bin", "deno")] = `${modules}/deno/cli.js`;
    world.path.unshift("/opt/bin");
    const inv = await run(world).inventory;
    expect(inv.tools.filter((t) => t.name === "deno").map((t) => t.id)).toEqual([
      "global:npm:deno",
    ]);
  });

  it("is not a second tool when pnpm installed it globally", async () => {
    // pnpm's command is a script in its bin directory, not a link into the
    // package: only its place and the package's bin say whose it is.
    const pnpmHome = "/home/me/.local/share/pnpm";
    const pkg = `${pnpmHome}/global/5/node_modules/deno`;
    const world = empty();
    world.executables.push(command(pnpmHome, "deno"));
    world.files[`${pkg}/package.json`] = JSON.stringify({ version: "2.0.0", bin: "cli.js" });
    const fs = memoryFs(world.files, { executables: world.executables });
    const runner = fakeRunner({
      "pnpm.version": ok("10.0.0\n"),
      "pnpm.root.global": ok(`${p(`${pnpmHome}/global/5/node_modules`)}\n`),
      "pnpm.bin.global": ok(`${p(pnpmHome)}\n`),
      "pnpm.list.global": ok(
        JSON.stringify([{ dependencies: { deno: { version: "2.0.0", path: p(pkg) } } }]),
      ),
    });
    const inv = await buildInventory(
      {
        fs,
        runner,
        env: {
          platform: process.platform,
          homeDir: p(HOME),
          get: (n) => (n === "PATH" ? p(pnpmHome) : n === "PATHEXT" ? ".EXE;.CMD" : undefined),
        },
        net: netContext(undefined),
        config: config(),
        cwd: "/tmp",
      },
      { globalOnly: true },
    );
    expect(inv.tools.filter((t) => t.name === "deno").map((t) => t.id)).toEqual([
      "global:pnpm:deno",
    ]);
  });

  it("stands for an unknown executable with its name, without a second id", async () => {
    const world = empty();
    world.executables.push(command(`${HOME}/.local/bin`, "git"), command("/usr/bin", "git"));
    world.path.push("/usr/bin");
    const inv = await run(world).inventory;
    const gits = inv.tools.filter((t) => t.name === "git");
    expect(gits).toHaveLength(1);
    expect(JSON.stringify(gits[0]?.installation)).toContain("another git");
    expect(inv.diagnostics.filter((d) => d.message.includes("share the id"))).toEqual([]);
  });
});

describe("looking commands up on PATH (ADR 0011)", () => {
  it("asks for files by name and never lists a PATH directory", async () => {
    const world = empty();
    world.executables.push(command("/usr/bin", "git"), command("/usr/bin", "other"));
    const base = memoryFs(world.files, { executables: world.executables });
    const listed: string[] = [];
    const fs: Filesystem = {
      ...base,
      readDir: async (path) => {
        listed.push(path);
        return base.readDir(path);
      },
    };
    const found = await findCommands(fs, ["git", "missing"], {
      path: ["/usr/bin", "/nope"].map(p).join(delimiter),
      pathext: ".EXE",
      platform: process.platform,
    });
    expect(found.map((f) => f.name)).toEqual(["git"]);
    expect(listed).toEqual([]);
  });
});
