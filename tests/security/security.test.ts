import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockAgent } from "undici";
import { buildInventory } from "../../src/application/inventory.js";
import { renderDiagnostics, renderExplain, renderStatus } from "../../src/cli/output/human.js";
import { toolJson } from "../../src/cli/output/json.js";
import { createStyle } from "../../src/cli/output/style.js";
import { claimFrom } from "../../src/core/confidence.js";
import { notApplicable } from "../../src/core/model.js";
import { buildRecord } from "../../src/core/record.js";
import { afterAll, describe, expect, it } from "vitest";
import { NetworkError } from "../../src/core/errors.js";
import { ALLOWED_COMMANDS } from "../../src/core/ports.js";
import {
  buildInvocation,
  COMMAND_TABLE,
} from "../../src/infrastructure/command-runner/allowlist.js";
import { nodeCommandRunner } from "../../src/infrastructure/command-runner/node-command-runner.js";
import { undiciHttpClient } from "../../src/infrastructure/http/undici-http-client.js";
import { fileLocalState } from "../../src/infrastructure/local-state/file-local-state.js";
import { parsePnpmConfig } from "../../src/providers/npm-registry/registry-config.js";
import {
  config,
  fakeEnv,
  fakeHttp,
  fakeRunner,
  memoryFs,
  netContext,
  ok,
} from "../helpers/fakes.js";

const ctx = {
  neutralDir: "/tmp/neutral",
  baseEnv: { PATH: "/usr/bin", HOME: "/home/me", GIT_DIR: "/evil" },
};

describe("CommandRunner allowlist (architecture.md §7)", () => {
  it("is exactly the documented list of 7 read-only commands", () => {
    expect(
      Object.entries(COMMAND_TABLE).map(([id, s]) => `${id}: ${s.binary} ${s.args.join(" ")}`),
    ).toEqual([
      "pnpm.version: pnpm --version",
      "pnpm.root.global: pnpm root --global",
      "pnpm.bin.global: pnpm bin --global",
      "pnpm.list.global: pnpm list --global --json --depth=0",
      "pnpm.config.list: pnpm config list --json",
      "git.tags.head: git tag --points-at HEAD",
      "git.describe.head: git describe --tags --long HEAD",
    ]);
    expect(Object.keys(COMMAND_TABLE)).toEqual([...ALLOWED_COMMANDS]);
    expect(Object.isFrozen(COMMAND_TABLE)).toBe(true);
  });

  it("rejects commands outside the list", () => {
    expect(buildInvocation({ command: "pnpm.add" as never }, ctx)).toHaveProperty("rejected");
    expect(buildInvocation({ command: "__proto__" as never }, ctx)).toHaveProperty("rejected");
  });

  it("never runs pnpm inside a project: pnpm always runs in the neutral directory", () => {
    for (const id of ALLOWED_COMMANDS.filter((c) => c.startsWith("pnpm."))) {
      expect(buildInvocation({ command: id }, ctx)).toMatchObject({ cwd: "/tmp/neutral" });
      expect(buildInvocation({ command: id, repository: "/some/project" }, ctx)).toHaveProperty(
        "rejected",
      );
    }
  });

  it("keeps pnpm from reaching the network or pinning versions on its own", () => {
    expect(buildInvocation({ command: "pnpm.list.global" }, ctx)).toMatchObject({
      env: { npm_config_update_notifier: "false", COREPACK_ENABLE_AUTO_PIN: "0", LC_ALL: "C" },
    });
  });

  it("requires an absolute repository for git", () => {
    expect(buildInvocation({ command: "git.tags.head" }, ctx)).toHaveProperty("rejected");
    expect(
      buildInvocation({ command: "git.tags.head", repository: "relative/path" }, ctx),
    ).toHaveProperty("rejected");
  });

  it("hardens git: no system/global config, no fsmonitor, no pager, no prompts, no GIT_* from the caller", () => {
    const inv = buildInvocation({ command: "git.describe.head", repository: "/repo" }, ctx);
    expect(inv).toMatchObject({
      binary: "git",
      args: ["-c", "core.fsmonitor=false", "describe", "--tags", "--long", "HEAD"],
      cwd: "/repo",
      env: {
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_PAGER: "cat",
        GIT_TERMINAL_PROMPT: "0",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_NO_LAZY_FETCH: "1",
        GIT_ALLOW_PROTOCOL: "",
        LC_ALL: "C",
      },
    });
    expect("GIT_DIR" in (inv as { env: object }).env).toBe(false);
  });
});

describe("hardened git against a hostile repository", () => {
  const dir = mkdtempSync(join(tmpdir(), "actually-sec-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function hostileRepo(name: string, marker: string): string {
    const repo = join(dir, name);
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", [
      "-C",
      repo,
      "-c",
      "user.email=a@b",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x",
    ]);
    execFileSync("git", ["-C", repo, "tag", "v1.0.0"]);
    // A hostile repository config: fsmonitor runs a command on index reads.
    execFileSync("git", ["-C", repo, "config", "core.fsmonitor", `touch ${marker}`]);
    return repo;
  }

  it("control: an unhardened git status runs the planted command", () => {
    const marker = join(dir, "control-pwned");
    const repo = hostileRepo("control", marker);
    execFileSync("git", ["status"], { cwd: repo, stdio: "ignore" });
    expect(existsSync(marker)).toBe(true);
  });

  it("the hardening options and environment stop it, even for git status", () => {
    const marker = join(dir, "hardened-pwned");
    const repo = hostileRepo("hardened", marker);
    const inv = buildInvocation(
      { command: "git.tags.head", repository: repo },
      { neutralDir: dir, baseEnv: process.env },
    );
    if ("rejected" in inv) throw new Error(inv.rejected);
    // Same options and environment the runner uses, with a command that
    // would read the index. The allowlisted commands never do.
    execFileSync("git", [...inv.args.slice(0, 2), "status"], {
      cwd: repo,
      env: inv.env,
      stdio: "ignore",
    });
    expect(existsSync(marker)).toBe(false);
  });

  // A partial clone whose tag points at a missing object: reading the tag
  // makes git fetch it with the repository's own core.sshCommand (F-01).
  function lazyFetchRepo(name: string, marker: string): string {
    const repo = join(dir, name);
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", [
      "-C",
      repo,
      "-c",
      "user.email=a@b",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x",
    ]);
    for (const [key, value] of [
      ["extensions.partialClone", "origin"],
      ["remote.origin.url", "ssh://example.invalid/r.git"],
      ["remote.origin.promisor", "true"],
      ["core.sshCommand", `touch ${marker}; false`],
    ] as const) {
      execFileSync("git", ["-C", repo, "config", key, value]);
    }
    writeFileSync(join(repo, ".git", "refs", "tags", "v9.9.9"), `${"1".repeat(40)}\n`);
    return repo;
  }

  it("control: an unhardened git describe on a hostile partial clone runs its sshCommand", () => {
    const marker = join(dir, "lazy-control-pwned");
    const repo = lazyFetchRepo("lazy-control", marker);
    try {
      execFileSync("git", ["describe", "--tags", "--long", "HEAD"], {
        cwd: repo,
        stdio: "ignore",
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch {
      // git fails after the fetch attempt; the marker is what matters.
    }
    expect(existsSync(marker)).toBe(true);
  });

  it("the hardened environment never lazily fetches, so the sshCommand never runs", async () => {
    const marker = join(dir, "lazy-hardened-pwned");
    const repo = lazyFetchRepo("lazy-hardened", marker);
    const runner = nodeCommandRunner({ neutralDir: async () => dir });
    await runner.run({ command: "git.tags.head", repository: repo });
    await runner.run({ command: "git.describe.head", repository: repo });
    expect(existsSync(marker)).toBe(false);
  });

  it("allowlisted git commands work on that repository without running it", async () => {
    const marker = join(dir, "runner-pwned");
    const repo = hostileRepo("runner", marker);
    const runner = nodeCommandRunner({ neutralDir: async () => dir });
    expect(await runner.run({ command: "git.tags.head", repository: repo })).toMatchObject({
      ok: true,
      stdout: "v1.0.0\n",
    });
    expect(await runner.run({ command: "git.describe.head", repository: repo })).toMatchObject({
      ok: true,
    });
    expect(existsSync(marker)).toBe(false);
  });
});

describe("pnpm config output may contain secrets", () => {
  it("keeps only registry keys", () => {
    const parsed = parsePnpmConfig(
      JSON.stringify({
        registry: "https://registry.npmjs.org/",
        "@corp:registry": "https://npm.corp/",
        "//npm.corp/:_authToken": "SECRET-1",
        _auth: "SECRET-2",
        "https-proxy": "http://user:SECRET-3@proxy",
      }),
    );
    expect(JSON.stringify(parsed, (_k, v) => (v instanceof Map ? [...v] : v))).not.toMatch(
      /SECRET/,
    );
    expect(parsed).toMatchObject({ state: "known", defaultPublic: true });
  });

  // A registry value can carry a credential in its user info, its query or its
  // path (a token as a path segment). None of it may be kept (F-31).
  const privateRegistry = "https://user:SECRET-4@npm.corp.example/SECRET-6/?token=SECRET-5";

  it("keeps no part of a registry URL, which can carry credentials (F-31)", () => {
    const parsed = parsePnpmConfig(
      JSON.stringify({ registry: privateRegistry, "@corp:registry": privateRegistry }),
    );
    expect(JSON.stringify(parsed, (_k, v) => (v instanceof Map ? [...v] : v))).not.toMatch(
      /SECRET|corp\.example/,
    );
    expect(parsed).toMatchObject({ state: "known", defaultPublic: false });
  });

  it("never shows a registry URL in explain or JSON output (F-31)", async () => {
    const home = "/home/me";
    const root = `${home}/p`;
    const scenarios = [
      { pnpmConfig: { registry: privateRegistry }, npmrc: undefined },
      {
        pnpmConfig: { registry: "https://registry.npmjs.org/" },
        npmrc: `registry=${privateRegistry}\n@corp:registry="${privateRegistry}"\n`,
      },
    ];
    for (const { pnpmConfig, npmrc } of scenarios) {
      const inventory = await buildInventory(
        {
          fs: memoryFs({
            [`${root}/package.json`]: JSON.stringify({
              dependencies: { a: "^1.0.0", "@corp/b": "^1.0.0" },
            }),
            ...(npmrc ? { [`${root}/.npmrc`]: npmrc } : {}),
          }),
          runner: fakeRunner({ "pnpm.config.list": ok(JSON.stringify(pnpmConfig)) }),
          env: fakeEnv(home),
          net: netContext(fakeHttp({})),
          config: config(),
          cwd: root,
        },
        { projectOnly: true },
      );
      expect(inventory.tools).toHaveLength(2);
      const outputs = [
        JSON.stringify(inventory),
        ...inventory.tools.map((tool) =>
          renderExplain(tool, { home, verbose: true, style: createStyle(false) }),
        ),
        ...inventory.tools.map((tool) => JSON.stringify(toolJson(tool, true))),
      ];
      for (const text of outputs) expect(text).not.toMatch(/SECRET|corp\.example/);
      expect(inventory.tools[0]?.versions.latest).toMatchObject({
        state: "unknown",
        evidence: expect.arrayContaining([
          expect.objectContaining({ description: expect.stringContaining("not the public") }),
        ]),
      });
    }
  });
});

describe("HttpClient (architecture.md §8)", () => {
  function client(token?: string) {
    const agent = new MockAgent();
    agent.disableNetConnect();
    const client = undiciHttpClient({
      userAgent: "actually/test",
      githubToken: token,
      dispatcher: agent,
    });
    return { agent, client };
  }

  it("refuses hosts outside the allowlist and plain http", async () => {
    const { client: http } = client();
    await expect(http.getJson("https://evil.example/x")).rejects.toMatchObject({
      kind: "host-not-allowed",
    });
    await expect(http.getJson("http://registry.npmjs.org/x")).rejects.toMatchObject({
      kind: "host-not-allowed",
    });
  });

  it("sends the GitHub token only to api.github.com", async () => {
    const { agent, client: http } = client("gh-token");
    let npmAuth: unknown = "unset";
    let ghAuth: unknown = "unset";
    agent
      .get("https://registry.npmjs.org")
      .intercept({ path: "/x/latest" })
      .reply((opts) => {
        npmAuth = (opts.headers as Record<string, string>).authorization;
        return {
          statusCode: 200,
          data: { version: "1.0.0" },
          responseOptions: { headers: { "content-type": "application/json" } },
        };
      });
    agent
      .get("https://api.github.com")
      .intercept({ path: "/repos/o/r/releases/latest" })
      .reply((opts) => {
        ghAuth = (opts.headers as Record<string, string>).authorization;
        return { statusCode: 404, data: "" };
      });
    await http.getJson("https://registry.npmjs.org/x/latest");
    await http.getJson("https://api.github.com/repos/o/r/releases/latest");
    expect(npmAuth).toBeUndefined();
    expect(ghAuth).toBe("Bearer gh-token");
  });

  it("never follows a redirect to a host outside the allowlist (F-02)", async () => {
    const { agent, client: http } = client();
    let evilHit = false;
    agent
      .get("https://registry.npmjs.org")
      .intercept({ path: "/x/latest" })
      .reply(302, "", { headers: { location: "https://evil.example/x" } });
    agent
      .get("https://evil.example")
      .intercept({ path: "/x" })
      .reply(() => {
        evilHit = true;
        return {
          statusCode: 200,
          data: { version: "6.6.6" },
          responseOptions: { headers: { "content-type": "application/json" } },
        };
      });
    await expect(http.getJson("https://registry.npmjs.org/x/latest")).rejects.toMatchObject({
      kind: "host-not-allowed",
    });
    expect(evilHit).toBe(false);
  });

  it("follows redirects within an allowed host, sending the token only there", async () => {
    const { agent, client: http } = client("gh-token");
    let auth: unknown = "unset";
    agent
      .get("https://api.github.com")
      .intercept({ path: "/repos/old/r/releases/latest" })
      .reply(301, "", { headers: { location: "/repositories/1/releases/latest" } });
    agent
      .get("https://api.github.com")
      .intercept({ path: "/repositories/1/releases/latest" })
      .reply((opts) => {
        auth = (opts.headers as Record<string, string>).authorization;
        return {
          statusCode: 200,
          data: { tag_name: "v1.0.0" },
          responseOptions: { headers: { "content-type": "application/json" } },
        };
      });
    const res = await http.getJson("https://api.github.com/repos/old/r/releases/latest");
    expect(res).toMatchObject({ status: 200, body: { tag_name: "v1.0.0" } });
    expect(auth).toBe("Bearer gh-token");
  });

  it("does not follow redirects to http, even on an allowed host", async () => {
    const { agent, client: http } = client();
    agent
      .get("https://registry.npmjs.org")
      .intercept({ path: "/z/latest" })
      .reply(301, "", { headers: { location: "http://registry.npmjs.org/z/latest" } });
    await expect(http.getJson("https://registry.npmjs.org/z/latest")).rejects.toMatchObject({
      kind: "host-not-allowed",
    });
  });

  it("cuts responses larger than 5 MB (F-14)", async () => {
    const { agent, client: http } = client();
    const big = JSON.stringify({ version: "1.0.0", padding: "x".repeat(6 * 1024 * 1024) });
    agent
      .get("https://registry.npmjs.org")
      .intercept({ path: "/big/latest" })
      .reply(200, big, { headers: { "content-type": "application/json" } });
    await expect(http.getJson("https://registry.npmjs.org/big/latest")).rejects.toMatchObject({
      kind: "invalid-response",
      message: "response from registry.npmjs.org is too large",
    });
  });

  it("cancels pending and later requests when its signal aborts (F-16)", async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    const controller = new AbortController();
    const http = undiciHttpClient({
      userAgent: "actually/test",
      signal: controller.signal,
      dispatcher: agent,
    });
    agent
      .get("https://registry.npmjs.org")
      .intercept({ path: "/slow/latest" })
      .reply(200, { version: "1.0.0" }, { headers: { "content-type": "application/json" } })
      .delay(5_000);
    const pending = http.getJson("https://registry.npmjs.org/slow/latest");
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
    await expect(http.getJson("https://registry.npmjs.org/other/latest")).rejects.toMatchObject({
      kind: "cancelled",
    });
  });

  it("maps connection failures to recoverable NetworkError", async () => {
    const { client: http } = client();
    await expect(http.getJson("https://registry.npmjs.org/y/latest")).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});

describe("untrusted text never reaches the terminal as control sequences (F-05)", () => {
  const osc = "\u001b]0;pwned\u0007x";
  const tool = buildRecord({
    name: osc,
    scope: "project",
    projectRoot: "/p",
    versions: {
      requested: claimFrom("^1.0.0", [
        { kind: "fact", source: "/p/package.json", description: `declares "${osc}"` },
      ]),
      resolved: notApplicable,
      installed: claimFrom("1.0.0", [{ kind: "fact", source: "/p/x", description: "v" }]),
      latest: claimFrom("2.0.0", [{ kind: "fact", source: "GET x", description: "\u009b2J" }]),
    },
    installation: { state: "unknown", reason: `bad \u001b[2K`, evidence: [] },
    source: { state: "unknown", reason: "none", evidence: [] },
    update: { state: "unknown", reason: "none", evidence: [] },
  });
  const opts = { home: "/home/me", verbose: true, style: createStyle(false) };
  const hasControl = (text: string) =>
    [...text].some((c) => {
      const code = c.codePointAt(0) ?? 0;
      return code !== 0x0a && (code <= 0x1f || (code >= 0x7f && code <= 0x9f));
    });

  it("escapes them in status, explain and diagnostics", () => {
    const status = renderStatus(
      {
        tools: [tool],
        projects: [
          {
            root: "/p",
            packageManager: notApplicable,
            repository: notApplicable,
            dependenciesChecked: 1,
            updatesAvailable: 1,
          },
        ],
        diagnostics: [],
      },
      opts,
    );
    const explain = renderExplain(tool, opts);
    const diagnostics = renderDiagnostics(
      [{ severity: "warning", source: "pnpm", message: `failed: ${osc}\nfake line` }],
      "/home/me",
    );
    for (const text of [status, explain, diagnostics]) {
      expect(hasControl(text)).toBe(false);
    }
    expect(status).toContain("\\x1b]0;pwned\\x07x");
    expect(diagnostics).toContain("\\x0afake line");
  });

  it("keeps colors, which the output adds itself", () => {
    const colored = renderExplain(tool, { ...opts, style: createStyle(true) });
    expect(colored).toContain("\u001b[");
    expect(colored).not.toContain("\u001b]0;");
  });
});

describe("neutral directory for pnpm (architecture.md §7, F-06)", () => {
  const dir = mkdtempSync(join(tmpdir(), "actually-state-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("never falls back to a shared temporary directory", async () => {
    const stateDir = join(dir, "state");
    const state = fileLocalState(stateDir);
    expect(await state.neutralDir()).toBe(join(stateDir, "empty"));

    const planted = join(dir, "planted");
    mkdirSync(join(planted, "empty"), { recursive: true });
    writeFileSync(join(planted, "empty", "package.json"), "{}");
    await expect(fileLocalState(planted).neutralDir()).rejects.toThrow(/not empty/);
  });

  it("does not run pnpm without a neutral directory, but still runs git", async () => {
    const runner = nodeCommandRunner({
      neutralDir: async () => {
        throw new Error("not empty");
      },
    });
    expect(await runner.run({ command: "pnpm.version" })).toMatchObject({
      ok: false,
      reason: "failed",
      message: expect.stringContaining("no neutral directory"),
    });
    expect(
      buildInvocation({ command: "pnpm.version" }, { neutralDir: "", baseEnv: {} }),
    ).toHaveProperty("rejected");
    const repo = join(dir, "repo");
    execFileSync("git", ["init", "-q", repo]);
    expect(await runner.run({ command: "git.tags.head", repository: repo })).not.toMatchObject({
      message: expect.stringContaining("neutral"),
    });
  });
});
