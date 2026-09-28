import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInventory } from "../../src/application/inventory.js";
import { UsageError } from "../../src/core/errors.js";
import { nodeFilesystem } from "../../src/infrastructure/filesystem/node-filesystem.js";
import {
  config,
  fakeEnv,
  fakeHttp,
  fakeRunner,
  json,
  memoryFs,
  netContext,
  ok,
  PNPM_CONFIG_PUBLIC,
} from "../helpers/fakes.js";

const HOME = "/home/me";
const PNPM_HOME = "/home/me/.local/share/pnpm";
const ROOT = `${PNPM_HOME}/global/5/node_modules`;

function pnpmWorld(pnpmConfig = PNPM_CONFIG_PUBLIC) {
  const runner = fakeRunner({
    "pnpm.version": ok("10.0.0\n"),
    "pnpm.root.global": ok(`${ROOT}\n`),
    "pnpm.bin.global": ok(`${PNPM_HOME}\n`),
    "pnpm.config.list": ok(pnpmConfig),
    "pnpm.list.global": ok(
      JSON.stringify([
        {
          path: `${PNPM_HOME}/global/5`,
          dependencies: {
            gstack: {
              version: "1.0.0",
              resolved: "https://registry.npmjs.org/gstack/-/gstack-1.0.0.tgz",
              path: `${ROOT}/.pnpm/gstack/node_modules/gstack`,
            },
            mine: { version: "link:../../../mine", path: "/home/me/mine" },
          },
        },
      ]),
    ),
  });
  const fs = memoryFs(
    {
      [`${PNPM_HOME}/global/5/package.json`]: JSON.stringify({
        dependencies: { gstack: "^1.0.0", mine: "link:../../../mine" },
      }),
      [`${ROOT}/.pnpm/gstack/node_modules/gstack/package.json`]: JSON.stringify({
        bin: "cli.js",
        repository: "github:example/gstack",
      }),
    },
    { executables: [`${PNPM_HOME}/gstack`, `${PNPM_HOME}/pnpm`, `${HOME}/.local/bin/custom-tool`] },
  );
  return { runner, fs };
}

// pnpm 12 layout, as `pnpm add -g` 12.6.0 leaves it: `pnpm root --global` is
// global/v11 and each package gets its own directory with its own package.json.
const PNPM12_ROOT = `${PNPM_HOME}/global/v11`;

function pnpm12World(pnpmConfig = PNPM_CONFIG_PUBLIC) {
  const isNumber = `${PNPM12_ROOT}/2c-18d9606f358acbc3-0`;
  const types = `${PNPM12_ROOT}/2c-18d9606f75c4749e-2`;
  const runner = fakeRunner({
    "pnpm.version": ok("12.6.0\n"),
    "pnpm.root.global": ok(`${PNPM12_ROOT}\n`),
    "pnpm.bin.global": ok(`${PNPM_HOME}/bin\n`),
    "pnpm.config.list": ok(pnpmConfig),
    "pnpm.list.global": ok(
      JSON.stringify([
        {
          path: PNPM12_ROOT,
          private: true,
          dependencies: {
            "@types/node": {
              from: "@types/node",
              version: "22.0.0",
              path: `${types}/node_modules/@types/node`,
            },
            "is-number": {
              from: "is-number",
              version: "6.0.0",
              path: `${isNumber}/node_modules/is-number`,
            },
            stray: {
              from: "stray",
              version: "1.0.0",
              path: "/home/me/elsewhere/node_modules/stray",
            },
          },
        },
      ]),
    ),
  });
  const fs = memoryFs({
    [`${isNumber}/package.json`]: JSON.stringify({ dependencies: { "is-number": "6.0.0" } }),
    [`${types}/package.json`]: JSON.stringify({ dependencies: { "@types/node": "22.0.0" } }),
    // A manifest outside the global root must never supply a spec.
    "/home/me/elsewhere/package.json": JSON.stringify({ dependencies: { stray: "^1.0.0" } }),
  });
  return { runner, fs };
}

const registry = {
  "https://registry.npmjs.org/gstack/latest": json({
    version: "2.0.0",
    repository: { url: "git+https://github.com/example/gstack.git" },
  }),
  "https://registry.npmjs.org/pnpm/latest": json({ version: "10.0.0" }),
};

describe("global inventory with pnpm", () => {
  it("detects pnpm packages, resolves latest and explains ownership", async () => {
    const { runner, fs } = pnpmWorld();
    const http = fakeHttp(registry);
    const inv = await buildInventory(
      { fs, runner, env: fakeEnv(HOME), net: netContext(http), config: config(), cwd: "/tmp" },
      { globalOnly: true },
    );
    const gstack = inv.tools.find((t) => t.name === "gstack");
    expect(gstack).toMatchObject({
      id: "global:pnpm:gstack",
      status: "outdated",
      updateType: "major",
      installation: { state: "known", value: { provider: "pnpm" }, confidence: "high" },
      source: { state: "known", value: { identifier: "example/gstack" }, confidence: "medium" },
    });
    const evidence =
      gstack?.installation.state === "known"
        ? gstack.installation.evidence.map((e) => e.description)
        : [];
    expect(evidence.join("\n")).toContain("global bin directory provides gstack");

    const pnpm = inv.tools.find((t) => t.name === "pnpm");
    expect(pnpm).toMatchObject({ status: "current" });

    const mine = inv.tools.find((t) => t.name === "mine");
    expect(mine?.versions.latest).toMatchObject({ state: "unknown" });

    const custom = inv.tools.find((t) => t.name === "custom-tool");
    expect(custom).toMatchObject({ id: "global:unknown:custom-tool", status: "unknown" });

    // Only public registry names left the machine; never the link package.
    expect(http.calls.map((c) => c.url).sort()).toEqual(Object.keys(registry).sort());
  });

  it("sends nothing to the public registry when the default registry is private", async () => {
    const { runner, fs } = pnpmWorld(JSON.stringify({ registry: "https://npm.corp.example/" }));
    const http = fakeHttp(registry);
    const inv = await buildInventory(
      { fs, runner, env: fakeEnv(HOME), net: netContext(http), config: config(), cwd: "/tmp" },
      { globalOnly: true },
    );
    expect(http.calls).toHaveLength(0);
    expect(inv.tools.find((t) => t.name === "gstack")?.versions.latest).toMatchObject({
      state: "unknown",
      reason: "private default registry configured",
    });
  });

  it("reads each package's spec from its own directory with pnpm 12 (F-50)", async () => {
    const { runner, fs } = pnpm12World();
    const http = fakeHttp({
      "https://registry.npmjs.org/is-number/latest": json({ version: "7.0.0" }),
      "https://registry.npmjs.org/@types%2Fnode/latest": json({ version: "22.1.0" }),
      "https://registry.npmjs.org/pnpm/latest": json({ version: "12.6.0" }),
    });
    const inv = await buildInventory(
      { fs, runner, env: fakeEnv(HOME), net: netContext(http), config: config(), cwd: "/tmp" },
      { globalOnly: true },
    );
    expect(inv.tools.find((t) => t.name === "is-number")).toMatchObject({
      status: "outdated",
      updateType: "major",
    });
    expect(inv.tools.find((t) => t.name === "@types/node")).toMatchObject({ status: "outdated" });
    // The package outside the global root is not trusted, so it is never queried.
    expect(inv.tools.find((t) => t.name === "stray")?.versions.latest).toMatchObject({
      state: "unknown",
      reason: "origin could not be determined: no spec found",
    });
    expect(http.calls.map((c) => c.url).sort()).toEqual([
      "https://registry.npmjs.org/@types%2Fnode/latest",
      "https://registry.npmjs.org/is-number/latest",
      "https://registry.npmjs.org/pnpm/latest",
    ]);
  });

  it("cites the pnpm 12 manifest that declares the spec (F-50)", async () => {
    const { runner, fs } = pnpm12World(JSON.stringify({ registry: "https://npm.corp.example/" }));
    const inv = await buildInventory(
      {
        fs,
        runner,
        env: fakeEnv(HOME),
        net: netContext(fakeHttp({})),
        config: config(),
        cwd: "/tmp",
      },
      { globalOnly: true },
    );
    const latest = inv.tools.find((t) => t.name === "is-number")?.versions.latest;
    expect(latest?.state === "unknown" ? latest.evidence : []).toContainEqual({
      kind: "fact",
      source: `${PNPM12_ROOT}/2c-18d9606f358acbc3-0/package.json`,
      description: 'declared as "6.0.0"',
    });
  });

  it("works offline without sending anything", async () => {
    const { runner, fs } = pnpmWorld();
    const inv = await buildInventory(
      { fs, runner, env: fakeEnv(HOME), net: netContext(undefined), config: config(), cwd: "/tmp" },
      { globalOnly: true },
    );
    expect(inv.tools.find((t) => t.name === "gstack")?.versions.latest).toMatchObject({
      reason: "offline",
    });
  });

  it("says what was not checked when pnpm cannot run (F-55)", async () => {
    const inv = await buildInventory(
      {
        fs: memoryFs({}),
        runner: fakeRunner({}),
        env: fakeEnv(HOME),
        net: netContext(fakeHttp({})),
        config: config(),
        cwd: "/tmp",
      },
      { globalOnly: true },
    );
    expect(inv.tools).toEqual([]);
    // Not an error: the result is valid but incomplete, and never silent.
    expect(inv.diagnostics.map((d) => d.severity)).toEqual(["warning", "warning"]);
    expect(inv.diagnostics.map((d) => d.message)).toEqual([
      "default registry not determined (pnpm.config.list not scripted): no package was queried on registry.npmjs.org",
      "pnpm.version not scripted: global packages were not checked",
    ]);
  });

  it("reports a real pnpm failure as an error, and a project run still warns (F-55)", async () => {
    const failing = fakeRunner({
      "pnpm.version": { ok: false, reason: "failed", message: "pnpm.version failed: boom" },
    });
    const global = await buildInventory(
      {
        fs: memoryFs({}),
        runner: failing,
        env: fakeEnv(HOME),
        net: netContext(fakeHttp({})),
        config: config(),
        cwd: "/tmp",
      },
      { globalOnly: true },
    );
    expect(global.diagnostics.map((d) => d.severity)).toEqual(["warning", "error"]);
    const project = await buildInventory(
      {
        fs: memoryFs({ [`${HOME}/p/package.json`]: JSON.stringify({ dependencies: { a: "^1" } }) }),
        runner: fakeRunner({}),
        env: fakeEnv(HOME),
        net: netContext(fakeHttp({})),
        config: config(),
        cwd: `${HOME}/p`,
      },
      { projectOnly: true },
    );
    expect(project.diagnostics).toHaveLength(1);
    expect(project.tools[0]?.versions.latest).toMatchObject({
      state: "unknown",
      reason: "origin could not be determined: pnpm is not installed",
    });
  });
});

describe("projects and Git repositories", () => {
  const files = {
    "/home/me/dev/app/package.json": JSON.stringify({ dependencies: { gstack: "^1.0.0" } }),
    "/home/me/dev/app/node_modules/gstack/package.json": JSON.stringify({ version: "1.5.0" }),
    "/home/me/dev/app/.git/HEAD": "ref: refs/heads/main\n",
    "/home/me/dev/app/.git/config": '[remote "origin"]\n\turl = https://github.com/me/app.git\n',
    "/home/me/tools/t/.git/HEAD": `${"c".repeat(40)}\n`,
    "/home/me/tools/t/.git/config": '[remote "origin"]\n\turl = https://github.com/me/t.git\n',
    "/home/me/tools/t/bin/t": "#!/bin/sh\n",
    "/home/me/tools/other/.git/HEAD": `${"d".repeat(40)}\n`,
  };

  it("treats repositories as projects unless evidence says they are tools", async () => {
    const fs = memoryFs(files, { symlinks: { "/home/me/.local/bin/t": "/home/me/tools/t/bin/t" } });
    const runner = fakeRunner({
      "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC),
      "git.tags.head": (repo) => ok(repo === "/home/me/tools/t" ? "v0.3.0\nlatest\n" : ""),
      "git.describe.head": { ok: false, reason: "failed", message: "no tags" },
    });
    const http = fakeHttp({
      ...registry,
      "https://api.github.com/repos/me/t/releases/latest": json({ tag_name: "v0.4.0" }),
    });
    const cfg = config((c) => {
      c.scan.paths = ["/home/me/dev", "/home/me/tools"];
    });
    const inv = await buildInventory({
      fs,
      runner,
      env: fakeEnv(HOME),
      net: netContext(http),
      config: cfg,
      cwd: "/tmp",
    });

    const t = inv.tools.find((x) => x.name === "t");
    expect(t).toMatchObject({
      id: "global:git:/home/me/tools/t",
      status: "outdated",
      updateType: "minor",
      mayBreak: true,
      installation: { state: "known", confidence: "low" },
      versions: { installed: { value: "0.3.0" }, latest: { value: "0.4.0" } },
    });
    expect(inv.projects.map((p) => p.root).sort()).toEqual([
      "/home/me/dev/app",
      "/home/me/tools/other",
    ]);
    const app = inv.projects.find((p) => p.root === "/home/me/dev/app");
    expect(app).toMatchObject({
      dependenciesChecked: 1,
      updatesAvailable: 1,
      repository: { state: "known" },
    });
    const dep = inv.tools.find((x) => x.id === "project:/home/me/dev/app:gstack");
    expect(dep).toMatchObject({
      status: "outdated",
      versions: { requested: { value: "^1.0.0" }, installed: { value: "1.5.0" } },
    });
  });

  function toolWorld(fs: ReturnType<typeof memoryFs>, scanPath: string) {
    const runner = fakeRunner({
      "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC),
      "git.tags.head": ok("v1.0.0\n"),
    });
    const cfg = config((c) => {
      c.scan.paths = [scanPath];
    });
    return { fs, runner, env: fakeEnv(HOME), net: netContext(undefined), config: cfg, cwd: "/tmp" };
  }

  it("a failing provider emits an error for the tool it affects (architecture.md §13, F-12)", async () => {
    const fs = memoryFs(files, { symlinks: { "/home/me/.local/bin/t": "/home/me/tools/t/bin/t" } });
    const world = toolWorld(fs, "/home/me/tools");
    world.runner = fakeRunner({
      "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC),
      "git.tags.head": { ok: false, reason: "timeout", message: "git.tags.head timed out" },
    });
    world.config.tools.git = [{ path: "/home/me/missing" }];
    const inv = await buildInventory(world, { globalOnly: true });
    const t = inv.tools.find((x) => x.name === "t");
    const missing = inv.tools.find((x) => x.name === "missing");
    expect(t).toMatchObject({ status: "error" });
    expect(missing).toMatchObject({ status: "error" });
    expect(inv.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "error", source: "git", toolId: t?.id }),
        expect.objectContaining({ severity: "error", source: "git", toolId: missing?.id }),
      ]),
    );
  });

  it("--global still recognizes a repository used as a tool (F-07)", async () => {
    const fs = memoryFs(files, { symlinks: { "/home/me/.local/bin/t": "/home/me/tools/t/bin/t" } });
    const inv = await buildInventory(toolWorld(fs, "/home/me/tools"), { globalOnly: true });
    expect(inv.tools.find((x) => x.name === "t")).toMatchObject({
      id: "global:git:/home/me/tools/t",
      versions: { installed: { value: "1.0.0" } },
    });
    expect(inv.projects).toEqual([]);
  });

  it("compares scan paths that go through a symlink by their real path (F-09)", async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "actually-f09-")));
    try {
      const home = join(base, "home");
      const repo = join(base, "data", "tools", "t");
      mkdirSync(join(repo, ".git"), { recursive: true });
      mkdirSync(join(repo, "bin"));
      mkdirSync(join(home, ".local", "bin"), { recursive: true });
      writeFileSync(join(repo, ".git", "HEAD"), `${"c".repeat(40)}\n`);
      writeFileSync(join(repo, "bin", "t"), "#!/bin/sh\n", { mode: 0o755 });
      symlinkSync(join(base, "data", "tools"), join(home, "tools"));
      symlinkSync(join(repo, "bin", "t"), join(home, ".local", "bin", "t"));
      const runner = fakeRunner({
        "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC),
        "git.tags.head": ok("v1.0.0\n"),
      });
      const cfg = config((c) => {
        c.scan.paths = [join(home, "tools")];
      });
      const inv = await buildInventory(
        {
          fs: nodeFilesystem(),
          runner,
          env: fakeEnv(home),
          net: netContext(undefined),
          config: cfg,
          cwd: base,
        },
        { globalOnly: true },
      );
      expect(inv.tools.map((x) => x.id)).toEqual([`global:git:${join(home, "tools", "t")}`]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("declared tools count as a fact and --project needs a project", async () => {
    const fs = memoryFs(files);
    const runner = fakeRunner({
      "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC),
      "git.tags.head": ok(""),
      "git.describe.head": ok("v1.0.0-2-gabc123\n"),
    });
    const cfg = config((c) => {
      c.tools.git = [{ path: "/home/me/tools/other" }];
    });
    const inv = await buildInventory(
      { fs, runner, env: fakeEnv(HOME), net: netContext(undefined), config: cfg, cwd: "/tmp" },
      { globalOnly: true },
    );
    const other = inv.tools.find((x) => x.name === "other");
    expect(other).toMatchObject({
      installation: { state: "known", confidence: "high" },
      versions: { installed: { state: "unknown" } },
    });
    expect(JSON.stringify(other?.versions.installed)).toContain("2 commits after tag v1.0.0");

    await expect(
      buildInventory(
        {
          fs,
          runner,
          env: fakeEnv(HOME),
          net: netContext(undefined),
          config: config(),
          cwd: "/tmp",
        },
        { projectOnly: true },
      ),
    ).rejects.toBeInstanceOf(UsageError);
  });
});

describe("ids (design.md §14)", () => {
  it("gives two repositories with the same name different ids (F-37)", async () => {
    const fs = memoryFs({
      "/home/me/vendor-a/tool/.git/HEAD": `${"a".repeat(40)}\n`,
      "/home/me/vendor-b/tool/.git/HEAD": `${"b".repeat(40)}\n`,
    });
    const cfg = config((c) => {
      c.tools.git = [{ path: "/home/me/vendor-a/tool" }, { path: "/home/me/vendor-b/tool" }];
    });
    const inv = await buildInventory(
      {
        fs,
        runner: fakeRunner({
          "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC),
          "git.tags.head": ok("v1.0.0\n"),
        }),
        env: fakeEnv(HOME),
        net: netContext(undefined),
        config: cfg,
        cwd: "/tmp",
      },
      { globalOnly: true },
    );
    expect(inv.tools.map((t) => t.id).sort()).toEqual([
      "global:git:/home/me/vendor-a/tool",
      "global:git:/home/me/vendor-b/tool",
    ]);
  });
  it("keeps one pnpm record when a pnpm executable is also found elsewhere (F-37)", async () => {
    const { runner } = pnpmWorld();
    const fs = memoryFs(
      {
        [`${PNPM_HOME}/global/5/package.json`]: JSON.stringify({
          dependencies: { gstack: "^1.0.0" },
        }),
      },
      // pnpm installed outside its own bin directory, e.g. with the npm prefix in ~/.local.
      { executables: [`${HOME}/.local/bin/pnpm`] },
    );
    const inv = await buildInventory(
      {
        fs,
        runner,
        env: fakeEnv(HOME),
        net: netContext(fakeHttp(registry)),
        config: config(),
        cwd: "/tmp",
      },
      { globalOnly: true },
    );
    const pnpm = inv.tools.filter((t) => t.name === "pnpm");
    expect(pnpm).toHaveLength(1);
    expect(pnpm[0]?.installation).toMatchObject({
      state: "unknown",
      evidence: [expect.objectContaining({ source: `${HOME}/.local/bin/pnpm` })],
    });
    const ids = inv.tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(inv.diagnostics.filter((d) => d.source === "actually")).toEqual([]);
  });
});

describe("current project root (mvp.md §6)", () => {
  it("stops at the nearest .git before a package.json further up (F-40)", async () => {
    const fs = memoryFs({
      "/home/me/work/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      "/home/me/work/py/.git/HEAD": "ref: refs/heads/main\n",
    });
    const inv = await buildInventory(
      {
        fs,
        runner: fakeRunner({ "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC) }),
        env: fakeEnv(HOME),
        net: netContext(fakeHttp({})),
        config: config(),
        cwd: "/home/me/work/py/src",
      },
      { projectOnly: true },
    );
    expect(inv.projects.map((p) => p.root)).toEqual(["/home/me/work/py"]);
    expect(inv.tools).toEqual([]);
  });
});

describe("installed by (architecture.md §6)", () => {
  it("is only as confident as the package manager it names (F-35)", async () => {
    const fs = memoryFs({
      "/home/me/p/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      "/home/me/p/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/a": { version: "1.0.0" } },
      }),
      "/home/me/p/node_modules/a/package.json": JSON.stringify({ version: "1.0.0" }),
    });
    const inv = await buildInventory(
      {
        fs,
        runner: fakeRunner({ "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC) }),
        env: fakeEnv(HOME),
        net: netContext(fakeHttp({})),
        config: config((c) => {
          c.network.enabled = false;
        }),
        cwd: "/home/me/p",
      },
      { projectOnly: true },
    );
    expect(inv.projects[0]?.packageManager).toMatchObject({ value: "npm", confidence: "low" });
    const a = inv.tools.find((t) => t.name === "a");
    expect(a?.installation).toMatchObject({ value: { provider: "npm" }, confidence: "low" });
  });
});

describe("project registry (architecture.md §8)", () => {
  const runner = () => fakeRunner({ "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC) });
  const deps = { "https://registry.npmjs.org/a/latest": json({ version: "1.0.0" }) };

  async function projectInventory(
    files: Record<string, string>,
    cwd: string,
    vars: Record<string, string> = {},
  ) {
    const http = fakeHttp(deps);
    const inv = await buildInventory(
      {
        fs: memoryFs(files),
        runner: runner(),
        env: fakeEnv(HOME, vars),
        net: netContext(http),
        config: config(),
        cwd,
      },
      { projectOnly: true },
    );
    return { inv, http };
  }

  it("applies the .npmrc of the pnpm workspace root from a subpackage (F-03)", async () => {
    const { inv, http } = await projectInventory(
      {
        [`${HOME}/ws/pnpm-workspace.yaml`]: "packages:\n  - app\n",
        [`${HOME}/ws/.npmrc`]: "registry=https://npm.mycorp.example/\n",
        [`${HOME}/ws/app/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      },
      `${HOME}/ws/app`,
    );
    expect(http.calls).toEqual([]);
    expect(inv.tools[0]?.versions.latest).toMatchObject({ state: "unknown" });
  });

  it("counts a .npmrc between the project and the workspace root as one more source", async () => {
    const files = (registry: string) => ({
      [`${HOME}/ws/pnpm-workspace.yaml`]: "packages:\n  - packages/*\n",
      [`${HOME}/ws/packages/.npmrc`]: `registry=${registry}\n`,
      [`${HOME}/ws/packages/app/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
    });
    const priv = await projectInventory(
      files("https://npm.mycorp.example/"),
      `${HOME}/ws/packages/app`,
    );
    expect(priv.http.calls).toEqual([]);
    const pub = await projectInventory(
      files("https://registry.npmjs.org/"),
      `${HOME}/ws/packages/app`,
    );
    expect(pub.http.calls.map((c) => c.url)).toEqual(["https://registry.npmjs.org/a/latest"]);
  });

  it("does not query when any .npmrc above the project sets a private registry (F-32)", async () => {
    const { http } = await projectInventory(
      {
        [`${HOME}/work/.npmrc`]: "registry=https://npm.mycorp.example/\n",
        [`${HOME}/work/p/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      },
      `${HOME}/work/p`,
    );
    expect(http.calls).toEqual([]);
  });

  // npm workspace: the lockfile and node_modules live in the root, and the
  // sibling @corp/utils is linked (F-32).
  const npmWorkspace = {
    [`${HOME}/ws/package.json`]: JSON.stringify({ name: "ws", workspaces: ["packages/*"] }),
    [`${HOME}/ws/package-lock.json`]: JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "ws", workspaces: ["packages/*"] },
        "packages/app": { name: "app" },
        "packages/utils": { name: "@corp/utils", version: "1.0.0" },
        "node_modules/@corp/utils": { resolved: "packages/utils", link: true },
        "node_modules/a": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/a/-/a-1.0.0.tgz",
        },
      },
    }),
    [`${HOME}/ws/node_modules/a/package.json`]: JSON.stringify({ version: "1.0.0" }),
    [`${HOME}/ws/packages/utils/package.json`]: JSON.stringify({
      name: "@corp/utils",
      version: "1.0.0",
    }),
    [`${HOME}/ws/packages/app/package.json`]: JSON.stringify({
      name: "app",
      dependencies: { "@corp/utils": "^1.0.0", a: "^1.0.0" },
    }),
  };

  it("never queries a sibling of an npm workspace, and reads the root lockfile (F-32)", async () => {
    const { inv, http } = await projectInventory(npmWorkspace, `${HOME}/ws/packages/app`);
    // Control: a plain registry dependency of the same member is still queried.
    expect(http.calls.map((c) => c.url)).toEqual(["https://registry.npmjs.org/a/latest"]);
    const utils = inv.tools.find((t) => t.name === "@corp/utils");
    expect(utils?.versions.latest).toMatchObject({
      state: "unknown",
      reason: "a package of the same workspace",
    });
    const a = inv.tools.find((t) => t.name === "a");
    expect(a?.versions.resolved).toMatchObject({
      state: "known",
      value: "1.0.0",
      evidence: [{ source: `${HOME}/ws/package-lock.json` }],
    });
    expect(a?.versions.installed).toMatchObject({
      state: "known",
      value: "1.0.0",
      evidence: [{ source: `${HOME}/ws/node_modules/a/package.json` }],
    });
  });

  it("applies the .npmrc of an npm workspace root (F-32)", async () => {
    const { http } = await projectInventory(
      { ...npmWorkspace, [`${HOME}/ws/.npmrc`]: "registry=https://npm.mycorp.example/\n" },
      `${HOME}/ws/packages/app`,
    );
    expect(http.calls).toEqual([]);
  });

  it("does not query a name a pnpm lockfile links locally (F-32)", async () => {
    const { inv, http } = await projectInventory(
      {
        [`${HOME}/ws/pnpm-workspace.yaml`]: "packages:\n  - packages/*\n",
        [`${HOME}/ws/pnpm-lock.yaml`]: [
          "lockfileVersion: '9.0'",
          "importers:",
          "  packages/app:",
          "    dependencies:",
          "      '@corp/utils':",
          "        specifier: ^1.0.0",
          "        version: link:../utils",
          "",
        ].join("\n"),
        [`${HOME}/ws/packages/app/package.json`]: JSON.stringify({
          dependencies: { "@corp/utils": "^1.0.0" },
        }),
      },
      `${HOME}/ws/packages/app`,
    );
    expect(http.calls).toEqual([]);
    const utils = inv.tools[0];
    expect(utils?.versions.latest).toMatchObject({
      state: "unknown",
      reason: "resolved locally by the lockfile",
    });
    expect(JSON.stringify(utils)).not.toContain("../utils");
  });

  it("does not query a sibling of a pnpm workspace that has no lockfile yet (F-32)", async () => {
    const { http } = await projectInventory(
      {
        [`${HOME}/ws/pnpm-workspace.yaml`]: "packages:\n  - packages/*\n",
        [`${HOME}/ws/packages/utils/package.json`]: JSON.stringify({ name: "@corp/utils" }),
        [`${HOME}/ws/packages/app/package.json`]: JSON.stringify({
          dependencies: { "@corp/utils": "^1.0.0" },
        }),
      },
      `${HOME}/ws/packages/app`,
    );
    expect(http.calls).toEqual([]);
  });

  it.each([
    [
      "a file: resolution (overrides)",
      { version: "1.0.0", resolved: "file:../internal-1.0.0.tgz" },
    ],
    ["a tarball on another host", { version: "1.0.0", resolved: "https://npm.corp.example/a.tgz" }],
    ["a link", { resolved: "../internal", link: true }],
  ])("does not query a dependency package-lock.json resolves to %s (F-32)", async (_, entry) => {
    const { http } = await projectInventory(
      {
        [`${HOME}/p/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
        [`${HOME}/p/package-lock.json`]: JSON.stringify({
          lockfileVersion: 3,
          packages: { "": {}, "node_modules/a": entry },
        }),
      },
      `${HOME}/p`,
    );
    expect(http.calls).toEqual([]);
  });

  it("does not query a dependency a v1 package-lock.json resolves to file: (F-32)", async () => {
    const { http } = await projectInventory(
      {
        [`${HOME}/p/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
        [`${HOME}/p/package-lock.json`]: JSON.stringify({
          lockfileVersion: 1,
          dependencies: { a: { version: "file:../a" } },
        }),
      },
      `${HOME}/p`,
    );
    expect(http.calls).toEqual([]);
  });

  it("takes the outermost workspace, so nested workspaces see all siblings (F-32)", async () => {
    const { http } = await projectInventory(
      {
        [`${HOME}/mono/package.json`]: JSON.stringify({ workspaces: ["apps/*", "libs/*"] }),
        [`${HOME}/mono/libs/shared/package.json`]: JSON.stringify({ name: "@corp/shared" }),
        [`${HOME}/mono/apps/web/package.json`]: JSON.stringify({
          name: "web",
          workspaces: ["plugins/*"],
          dependencies: { "@corp/shared": "^1.0.0" },
        }),
      },
      `${HOME}/mono/apps/web`,
    );
    expect(http.calls).toEqual([]);
  });

  it("queries nothing when the workspace cannot be fully read (F-32)", async () => {
    const app = {
      [`${HOME}/ws/package.json`]: JSON.stringify({ workspaces: ["packages/*"] }),
      [`${HOME}/ws/packages/app/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
    };
    const cases = [
      { ...app, [`${HOME}/ws/packages/broken/package.json`]: "{" },
      {
        ...app,
        [`${HOME}/ws/package.json`]: JSON.stringify({ workspaces: ["../elsewhere/*"] }),
      },
    ];
    for (const files of cases) {
      const { inv, http } = await projectInventory(files, `${HOME}/ws/packages/app`);
      expect(http.calls).toEqual([]);
      expect(inv.tools[0]?.versions.latest).toMatchObject({
        state: "unknown",
        reason: expect.stringContaining("origin could not be determined"),
      });
    }

    const http = fakeHttp(deps);
    await buildInventory(
      {
        fs: memoryFs(
          { ...app, [`${HOME}/elsewhere/package.json`]: JSON.stringify({ name: "@corp/x" }) },
          { symlinks: { [`${HOME}/ws/packages/linked`]: `${HOME}/elsewhere` } },
        ),
        runner: runner(),
        env: fakeEnv(HOME),
        net: netContext(http),
        config: config(),
        cwd: `${HOME}/ws/packages/app`,
      },
      { projectOnly: true },
    );
    expect(http.calls).toEqual([]);
  });

  it("does not query when the project .npmrc exists but cannot be read (F-04)", async () => {
    const { inv, http } = await projectInventory(
      {
        [`${HOME}/p/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }),
        // A directory named .npmrc: it exists, but reading it fails.
        [`${HOME}/p/.npmrc/x`]: "",
      },
      `${HOME}/p`,
    );
    expect(http.calls).toEqual([]);
    expect(inv.tools[0]?.versions.latest).toMatchObject({
      state: "unknown",
      reason: `origin could not be determined: ${HOME}/p/.npmrc could not be read`,
    });
  });

  it("does not query when a .yarnrc.yml sets a private registry, up to home (F-52)", async () => {
    const manifest = JSON.stringify({
      packageManager: "yarn@4.5.0",
      dependencies: { a: "^1.0.0" },
    });
    const project = await projectInventory(
      {
        [`${HOME}/p/package.json`]: manifest,
        [`${HOME}/p/.yarnrc.yml`]: "npmRegistryServer: https://npm.corp.example\n",
      },
      `${HOME}/p`,
    );
    expect(project.http.calls).toEqual([]);
    expect(project.inv.tools[0]?.versions.latest).toMatchObject({
      state: "unknown",
      reason: "private default registry configured",
    });
    const home = await projectInventory(
      {
        [`${HOME}/p/package.json`]: manifest,
        [`${HOME}/.yarnrc.yml`]: "npmRegistryServer: https://npm.corp.example\n",
      },
      `${HOME}/p`,
    );
    expect(home.http.calls).toEqual([]);
    const scoped = await projectInventory(
      {
        [`${HOME}/ws/.yarnrc.yml`]:
          "npmScopes:\n  corp:\n    npmRegistryServer: https://npm.corp.example\n",
        [`${HOME}/ws/p/package.json`]: JSON.stringify({
          dependencies: { a: "^1.0.0", "@corp/b": "^1.0.0" },
        }),
      },
      `${HOME}/ws/p`,
    );
    expect(scoped.http.calls.map((c) => c.url)).toEqual(["https://registry.npmjs.org/a/latest"]);
    expect(scoped.inv.tools.find((t) => t.name === "@corp/b")?.versions.latest).toMatchObject({
      reason: "scope @corp is mapped to a private registry",
    });
  });

  it("does not query when a yarn classic .yarnrc, an unreadable .yarnrc.yml or YARN_NPM_REGISTRY_SERVER points elsewhere (F-52)", async () => {
    const manifest = JSON.stringify({ dependencies: { a: "^1.0.0" } });
    const classic = await projectInventory(
      {
        [`${HOME}/p/package.json`]: manifest,
        [`${HOME}/p/.yarnrc`]: 'registry "https://npm.corp.example"\n',
      },
      `${HOME}/p`,
    );
    expect(classic.http.calls).toEqual([]);
    const unreadable = await projectInventory(
      { [`${HOME}/p/package.json`]: manifest, [`${HOME}/p/.yarnrc.yml/x`]: "" },
      `${HOME}/p`,
    );
    expect(unreadable.http.calls).toEqual([]);
    expect(unreadable.inv.tools[0]?.versions.latest).toMatchObject({
      reason: `origin could not be determined: ${HOME}/p/.yarnrc.yml could not be read`,
    });
    const env = await projectInventory({ [`${HOME}/p/package.json`]: manifest }, `${HOME}/p`, {
      YARN_NPM_REGISTRY_SERVER: "https://npm.corp.example",
    });
    expect(env.http.calls).toEqual([]);
  });

  it("never queries a local tarball spec or a dependency optionalDependencies makes local (F-33)", async () => {
    const { http } = await projectInventory(
      {
        [`${HOME}/p/package.json`]: JSON.stringify({
          dependencies: { a: "a-1.0.0.tgz", b: "^1.0.0" },
          optionalDependencies: { b: "file:../b" },
        }),
      },
      `${HOME}/p`,
    );
    expect(http.calls).toEqual([]);
  });
  it("still queries the public registry for a plain project", async () => {
    const { http } = await projectInventory(
      { [`${HOME}/p/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }) },
      `${HOME}/p`,
    );
    expect(http.calls.map((c) => c.url)).toEqual(["https://registry.npmjs.org/a/latest"]);
  });
});
