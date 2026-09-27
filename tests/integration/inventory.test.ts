import { describe, expect, it } from "vitest";
import { buildInventory } from "../../src/application/inventory.js";
import { UsageError } from "../../src/core/errors.js";
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

  it("degrades gracefully when pnpm is not installed", async () => {
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
    expect(inv.diagnostics).toEqual([]);
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
      id: "global:git:t",
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

describe("project registry (architecture.md §8)", () => {
  const runner = () => fakeRunner({ "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC) });
  const deps = { "https://registry.npmjs.org/a/latest": json({ version: "1.0.0" }) };

  async function projectInventory(files: Record<string, string>, cwd: string) {
    const http = fakeHttp(deps);
    const inv = await buildInventory(
      {
        fs: memoryFs(files),
        runner: runner(),
        env: fakeEnv(HOME),
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

  it("does not query when a .npmrc between the project and the workspace root exists", async () => {
    const { http } = await projectInventory(
      {
        [`${HOME}/ws/pnpm-workspace.yaml`]: "packages:\n  - packages/*\n",
        [`${HOME}/ws/packages/.npmrc`]: "registry=https://registry.npmjs.org/\n",
        [`${HOME}/ws/packages/app/package.json`]: JSON.stringify({
          dependencies: { a: "^1.0.0" },
        }),
      },
      `${HOME}/ws/packages/app`,
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

  it("still queries the public registry for a plain project", async () => {
    const { http } = await projectInventory(
      { [`${HOME}/p/package.json`]: JSON.stringify({ dependencies: { a: "^1.0.0" } }) },
      `${HOME}/p`,
    );
    expect(http.calls.map((c) => c.url)).toEqual(["https://registry.npmjs.org/a/latest"]);
  });
});
