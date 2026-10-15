import { mkdirSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/core/model.js";
import type { Filesystem } from "../../src/core/ports.js";
import { buildInvocation } from "../../src/infrastructure/command-runner/allowlist.js";
import {
  MAX_TEXT_BYTES,
  nodeFilesystem,
} from "../../src/infrastructure/filesystem/node-filesystem.js";
import { readRepository } from "../../src/providers/git/repository.js";
import { resolveGithubLatest } from "../../src/providers/github/resolver.js";
import { parseGithubUrl } from "../../src/providers/github/url.js";
import { findProjectRoot, scanProject } from "../../src/providers/project/project.js";
import { findWorkspace } from "../../src/providers/project/workspace.js";
import { cachedGet } from "../../src/providers/shared/cached-get.js";
import { fakeHttp, json, memoryCache, memoryFs, netContext, p } from "../helpers/fakes.js";

// Edge cases found by mutation testing (docs/review/2026-09-28-mutation.md):
// each test fails when the condition it names is flipped or shifted by one.

function throwingExists(base: Filesystem, path: string): Filesystem {
  return {
    ...base,
    exists: async (q) => {
      if (p(q) === p(path)) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
      return base.exists(q);
    },
  };
}

describe("GitHub edges", () => {
  const base = "https://api.github.com/repos/o/r";
  const state = () => ({ rateLimited: false, diagnostics: [] as Diagnostic[] });
  const repo = { owner: "o", repo: "r" };

  it("rejects a remote whose owner alone is invalid", () => {
    expect(parseGithubUrl("git@github.com:o!/r.git")).toBeUndefined();
    expect(parseGithubUrl("git@github.com:o/r!.git")).toBeUndefined();
  });
  it("treats a 403 with quota left as an answer, not the rate limit", async () => {
    const http = fakeHttp({
      [`${base}/releases/latest`]: {
        status: 403,
        headers: { "x-ratelimit-remaining": "42" },
        body: undefined,
      },
    });
    const s = state();
    const claim = await resolveGithubLatest(repo, netContext(http), s);
    expect(claim).toMatchObject({ state: "unknown", reason: "GitHub answered 403" });
    expect(s.rateLimited).toBe(false);
  });
  it("says GitHub answered oddly when /tags is not a list", async () => {
    const http = fakeHttp({ [`${base}/tags?per_page=100`]: json({ message: "odd" }) });
    expect(await resolveGithubLatest(repo, netContext(http), state())).toMatchObject({
      state: "unknown",
      reason: "GitHub answered 200",
    });
  });
  it("names why there is no version: no releases, no semver release, or unknown offline", async () => {
    const tags = json([{ name: "nightly" }]);
    const none = fakeHttp({ [`${base}/tags?per_page=100`]: tags });
    expect(await resolveGithubLatest(repo, netContext(none), state())).toMatchObject({
      reason: "no releases and no semver tags",
    });
    const odd = fakeHttp({
      [`${base}/releases/latest`]: json({ tag_name: "nightly" }),
      [`${base}/tags?per_page=100`]: tags,
    });
    expect(await resolveGithubLatest(repo, netContext(odd), state())).toMatchObject({
      reason: "no semver release and no semver tags",
    });
    const cache = memoryCache({ [`${base}/tags?per_page=100`]: { fetchedAt: 0, body: [] } });
    expect(
      await resolveGithubLatest(repo, netContext(undefined, { cache }), state()),
    ).toMatchObject({ reason: "no semver tags, and releases are unknown offline" });
  });
  it("cites the cached answer of /releases/latest as well as the cached tags", async () => {
    const cache = memoryCache({
      [`${base}/releases/latest`]: { fetchedAt: 0, status: 404, body: undefined },
      [`${base}/tags?per_page=100`]: { fetchedAt: 0, body: [{ name: "v2.0.0" }] },
    });
    const claim = await resolveGithubLatest(repo, netContext(undefined, { cache }), state());
    const cached =
      claim.state === "known" ? claim.evidence.filter((e) => e.source === "cache") : [];
    expect(cached).toHaveLength(2);
  });
});

describe("cached GET edges", () => {
  const url = "https://registry.npmjs.org/x/latest";
  it("expires an entry exactly at the TTL", async () => {
    const http = fakeHttp({ [url]: json({ version: "2.0.0" }) });
    const cache = memoryCache({ [url]: { fetchedAt: 0, body: { version: "1.0.0" } } });
    const result = await cachedGet(url, netContext(http, { cache, now: 60_000, ttlMs: 60_000 }));
    expect(result.kind).toBe("fresh");
  });
  it("treats a 500 as the service being unavailable", async () => {
    const http = fakeHttp({ [url]: { status: 500, headers: {}, body: undefined } });
    const cache = memoryCache({ [url]: { fetchedAt: 0, body: 1 } });
    expect((await cachedGet(url, netContext(http, { cache, now: 10 ** 9 }))).kind).toBe("stale");
  });
  it("stores the status of a cacheable non-200 answer, and none for a 200", async () => {
    const cache = memoryCache();
    const http = fakeHttp({ "https://x.example/ok": json(1) });
    await cachedGet(url, netContext(http, { cache }), {}, [404]);
    await cachedGet("https://x.example/ok", netContext(http, { cache }), {}, [404]);
    expect(cache.entries.get(url)?.status).toBe(404);
    expect(cache.entries.get("https://x.example/ok")?.status).toBeUndefined();
  });
});

describe("git repository edges", () => {
  it("prefers origin even when it is not the first remote", async () => {
    const fs = memoryFs({
      "/r/.git/HEAD": `${"a".repeat(40)}\n`,
      "/r/.git/config":
        '[remote "fork"]\n\turl = https://github.com/me/r.git\n[remote "origin"]\n\turl = https://github.com/up/r.git\n',
    });
    expect((await readRepository(fs, "/r"))?.github?.repo).toEqual({ owner: "up", repo: "r" });
  });
  it("warns when a .git that cannot be checked cannot be read either", async () => {
    const base = memoryFs({});
    const fs = throwingExists(
      { ...base, isDirectory: async () => false, readText: () => Promise.reject(new Error("x")) },
      "/r/.git",
    );
    const diagnostics: Diagnostic[] = [];
    expect(await readRepository(fs, "/r", diagnostics)).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
  });
});

describe("project edges", () => {
  it("does not take a marker it cannot check as the project root", async () => {
    const fs = throwingExists(memoryFs({ "/home/me/.git/HEAD": "x" }), "/home/me/a/package.json");
    expect(await findProjectRoot(fs, "/home/me/a/b", "/home/me")).toBe("/home/me");
  });
  it("warns about a package.json it cannot check", async () => {
    const fs = throwingExists(memoryFs({}), "/p/package.json");
    const scan = await scanProject(fs, "/p", "/");
    expect(scan.diagnostics).toHaveLength(1);
  });
  it("keeps the dependencies entry when devDependencies repeats the name", async () => {
    const fs = memoryFs({
      "/p/package.json": JSON.stringify({
        dependencies: { a: "^1.0.0" },
        devDependencies: { a: "^2.0.0" },
      }),
    });
    const scan = await scanProject(fs, "/p", "/");
    expect(scan.dependencies).toEqual([
      expect.objectContaining({ requested: "^1.0.0", section: "dependencies" }),
    ]);
  });
  it("reads link and file: entries of package-lock.json as local", async () => {
    const fs = memoryFs({
      "/p/package.json": JSON.stringify({ dependencies: { a: "^1.0.0", b: "^1.0.0" } }),
      "/p/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/a": { link: true, resolved: "packages/a" },
          "node_modules/b": { version: "1.0.0", resolved: "file:../b" },
          "node_modules/c": null,
        },
      }),
    });
    const scan = await scanProject(fs, "/p", "/");
    expect(scan.dependencies.map((d) => d.local !== undefined)).toEqual([true, true]);
    expect(scan.diagnostics).toEqual([]);
  });
  it("uses a member's own node_modules entry over the hoisted one", async () => {
    const fs = memoryFs({
      "/ws/package.json": JSON.stringify({ workspaces: ["app"] }),
      "/ws/app/package.json": JSON.stringify({ name: "app", dependencies: { a: "^1.0.0" } }),
      "/ws/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          app: {},
          "node_modules/a": { version: "1.0.0" },
          "app/node_modules/a": { version: "1.5.0" },
        },
      }),
    });
    const scan = await scanProject(fs, "/ws/app", "/");
    expect(scan.dependencies[0]?.resolved?.version).toBe("1.5.0");
  });
  it("does not read a workspace lockfile that does not list the member", async () => {
    const fs = memoryFs({
      "/ws/package.json": JSON.stringify({ workspaces: ["app"] }),
      "/ws/app/package.json": JSON.stringify({ name: "app", dependencies: { a: "^1.0.0" } }),
      "/ws/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/a": { version: "1.0.0" } },
      }),
    });
    const scan = await scanProject(fs, "/ws/app", "/");
    expect(scan.dependencies[0]?.resolved).toBeUndefined();
  });
  it("prefers the project's package-lock.json over a pnpm lockfile above that lists it", async () => {
    const fs = memoryFs({
      "/ws/pnpm-lock.yaml":
        "lockfileVersion: '9.0'\nimporters:\n  app:\n    dependencies:\n      a:\n        specifier: ^1.0.0\n        version: 1.9.9\n",
      "/ws/app/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      "/ws/app/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/a": { version: "1.2.0" } },
      }),
    });
    const scan = await scanProject(fs, "/ws/app", "/");
    expect(scan.dependencies[0]?.resolved?.version).toBe("1.2.0");
  });
});

describe("workspace edges", () => {
  const known = async (files: Record<string, string>, start = "/ws/a", max?: number) =>
    findWorkspace(memoryFs(files), start, "/", new Map(), max);

  it("accepts a null workspaces field, an empty pnpm-workspace.yaml and a null member", async () => {
    expect(
      await known({ "/ws/package.json": JSON.stringify({ workspaces: null }) }),
    ).not.toMatchObject({ state: "unknown" });
    expect(await known({ "/ws/pnpm-workspace.yaml": "" })).not.toMatchObject({
      state: "unknown",
    });
    expect(
      await known({
        "/ws/package.json": JSON.stringify({ workspaces: ["a"] }),
        "/ws/a/package.json": "null",
      }),
    ).toMatchObject({ state: "known" });
  });
  it("reads the yarn object form of workspaces", async () => {
    const scan = await known({
      "/ws/package.json": JSON.stringify({ workspaces: { packages: ["a"] } }),
      "/ws/a/package.json": JSON.stringify({ name: "@corp/a" }),
    });
    expect(scan).toMatchObject({ state: "known" });
    expect(scan?.state === "known" && [...scan.packages.keys()]).toContain("@corp/a");
  });
  it("gives up on a pattern with a backslash", async () => {
    expect(
      await known({ "/ws/package.json": JSON.stringify({ workspaces: ["packages\\*"] }) }),
    ).toMatchObject({ state: "unknown" });
  });
  it("walks exactly as many directories as allowed and no deeper than the patterns", async () => {
    const files = {
      "/ws/package.json": JSON.stringify({ workspaces: ["a"] }),
      "/ws/a/package.json": JSON.stringify({ name: "a" }),
      "/ws/a/deep/package.json": JSON.stringify({ name: "deep" }),
    };
    const scan = await known(files, "/ws/a", 2);
    expect(scan).toMatchObject({ state: "known" });
    expect(scan?.state === "known" && [...scan.packages.keys()]).toEqual(["a"]);
  });
});

describe("command runner edges", () => {
  it("drops only GIT_* variables for git and keeps the rest of the environment", () => {
    const inv = buildInvocation(
      { command: "git.tags.head", repository: "/repo" },
      { neutralDir: "/n", baseEnv: { PATH: "/usr/bin", GIT_DIR: "/evil" } },
    );
    expect(inv).toMatchObject({ env: { PATH: "/usr/bin" } });
    expect("env" in inv && inv.env.GIT_DIR).toBeUndefined();
  });
});

describe("filesystem edges", () => {
  const dir = mkdtempSync(join(tmpdir(), "actually-edges-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const fs = nodeFilesystem();

  it("reads a file of exactly the maximum size", async () => {
    const path = join(dir, "max");
    writeFileSync(path, "");
    truncateSync(path, MAX_TEXT_BYTES);
    await expect(fs.readText(path)).resolves.toHaveLength(MAX_TEXT_BYTES);
  });
  it("does not count a directory, a plain file or a missing path as executable", async () => {
    mkdirSync(join(dir, "d"));
    writeFileSync(join(dir, "plain"), "x", { mode: 0o644 });
    // Executable by its mode on Linux and macOS, by its extension on Windows.
    writeFileSync(join(dir, "run.cmd"), "x", { mode: 0o755 });
    expect(await fs.isDirectory(join(dir, "d"))).toBe(true);
    expect(await fs.isDirectory(join(dir, "missing"))).toBe(false);
    expect(await fs.isExecutableFile(join(dir, "d"))).toBe(false);
    expect(await fs.isExecutableFile(join(dir, "missing"))).toBe(false);
    expect(await fs.isExecutableFile(join(dir, "run.cmd"))).toBe(true);
    // Root passes X_OK checks on any file with an execute bit, and only then.
    expect(await fs.isExecutableFile(join(dir, "plain"))).toBe(false);
  });
});
