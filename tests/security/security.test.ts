import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockAgent } from "undici";
import { afterAll, describe, expect, it } from "vitest";
import { NetworkError } from "../../src/core/errors.js";
import { ALLOWED_COMMANDS } from "../../src/core/ports.js";
import {
  buildInvocation,
  COMMAND_TABLE,
} from "../../src/infrastructure/command-runner/allowlist.js";
import { nodeCommandRunner } from "../../src/infrastructure/command-runner/node-command-runner.js";
import { undiciHttpClient } from "../../src/infrastructure/http/undici-http-client.js";
import { parsePnpmConfig } from "../../src/providers/npm-registry/registry-config.js";

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
    expect(parsed).toMatchObject({
      state: "known",
      defaultRegistry: "https://registry.npmjs.org/",
    });
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

  it("maps connection failures to recoverable NetworkError", async () => {
    const { client: http } = client();
    await expect(http.getJson("https://registry.npmjs.org/y/latest")).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});
