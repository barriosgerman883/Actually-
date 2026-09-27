import { describe, expect, it } from "vitest";
import { NetworkError } from "../../src/core/errors.js";
import { parseRemotes, readRepository } from "../../src/providers/git/repository.js";
import { resolveGithubLatest } from "../../src/providers/github/resolver.js";
import { parseGithubUrl } from "../../src/providers/github/url.js";
import { decideOrigin, isRegistrySpec } from "../../src/providers/npm-registry/origin.js";
import { applyNpmrc, parsePnpmConfig } from "../../src/providers/npm-registry/registry-config.js";
import { latestUrl, resolveNpmLatest } from "../../src/providers/npm-registry/resolver.js";
import { scanProject } from "../../src/providers/project/project.js";
import { cachedGet } from "../../src/providers/shared/cached-get.js";
import {
  fakeHttp,
  json,
  memoryCache,
  memoryFs,
  netContext,
  PNPM_CONFIG_PUBLIC,
} from "../helpers/fakes.js";

const publicRegistry = parsePnpmConfig(PNPM_CONFIG_PUBLIC);

describe("registry specs", () => {
  it.each(["^1.2.0", "1.2.3", "~1", "*", "latest", "next", ">=1 <2"])("accepts %s", (spec) => {
    expect(isRegistrySpec(spec)).toBe(true);
  });
  it.each([
    "npm:other@1",
    "workspace:*",
    "link:../x",
    "file:../x",
    "github:a/b",
    "a/b",
    "git+https://x/y.git",
    "https://x/y.tgz",
    "catalog:",
    "",
  ])("rejects %s", (spec) => {
    expect(isRegistrySpec(spec)).toBe(false);
  });
});

describe("origin rule (architecture.md §8)", () => {
  it("queries a registry spec on the public registry", () => {
    expect(decideOrigin({ name: "semver", spec: "^7", registry: publicRegistry }).query).toBe(true);
  });
  it("does not query when the spec is missing", () => {
    expect(decideOrigin({ name: "x", spec: undefined, registry: publicRegistry })).toMatchObject({
      query: false,
    });
  });
  it("does not query anything when the default registry is private", () => {
    const priv = parsePnpmConfig(JSON.stringify({ registry: "https://npm.corp.example/" }));
    expect(decideOrigin({ name: "semver", spec: "^7", registry: priv })).toMatchObject({
      query: false,
      reason: "private default registry configured",
    });
    expect(decideOrigin({ name: "pnpm", spec: null, registry: priv }).query).toBe(false);
  });
  it("does not query a scope mapped to another registry", () => {
    const cfg = parsePnpmConfig(
      JSON.stringify({
        registry: "https://registry.npmjs.org/",
        "@acme:registry": "https://npm.acme/",
      }),
    );
    expect(decideOrigin({ name: "@acme/x", spec: "^1", registry: cfg }).query).toBe(false);
    expect(decideOrigin({ name: "@other/x", spec: "^1", registry: cfg }).query).toBe(true);
  });
  it("does not query when the registry could not be determined", () => {
    expect(
      decideOrigin({
        name: "x",
        spec: "^1",
        registry: { state: "unknown", reason: "pnpm is not installed" },
      }).query,
    ).toBe(false);
  });
  it("does not query a package installed from another tarball host", () => {
    expect(
      decideOrigin({
        name: "x",
        spec: "^1",
        registry: publicRegistry,
        resolvedTarball: "https://npm.corp/x/-/x-1.0.0.tgz",
      }).query,
    ).toBe(false);
  });
  it("honors exclude patterns", () => {
    expect(
      decideOrigin({
        name: "@corp/secret",
        spec: "^1",
        registry: publicRegistry,
        exclude: ["@corp/*"],
      }).query,
    ).toBe(false);
  });
  it("applies a project .npmrc, including a private default registry", () => {
    const cfg = applyNpmrc(publicRegistry, "registry=https://mirror.corp/\n", "/p/.npmrc");
    expect(decideOrigin({ name: "semver", spec: "^7", registry: cfg }).query).toBe(false);
  });
  it("treats ${VAR} registries in .npmrc as undetermined", () => {
    expect(applyNpmrc(publicRegistry, "registry=${REG}\n", "/p/.npmrc")).toMatchObject({
      state: "unknown",
    });
  });
});

describe("npm latest resolver", () => {
  const url = "https://registry.npmjs.org/semver/latest";
  const origin = decideOrigin({ name: "semver", spec: "^7", registry: publicRegistry });

  it("encodes scoped names and rejects path tricks", () => {
    expect(latestUrl("@scope/pkg")).toBe("https://registry.npmjs.org/@scope%2Fpkg/latest");
    expect(latestUrl("../etc")).toBeUndefined();
    expect(latestUrl("a/b/c")).toBeUndefined();
  });
  it("reports the dist-tag as a fact", async () => {
    const result = await resolveNpmLatest(
      "semver",
      origin,
      netContext(fakeHttp({ [url]: json({ version: "7.8.5" }) })),
    );
    expect(result.latest).toMatchObject({ state: "known", value: "7.8.5", confidence: "high" });
    expect(JSON.stringify(result.latest)).toContain('dist-tag \\"latest\\" is 7.8.5');
  });
  it("lowers confidence when the dist-tag points to a prerelease", async () => {
    const result = await resolveNpmLatest(
      "semver",
      origin,
      netContext(fakeHttp({ [url]: json({ version: "8.0.0-beta.1" }) })),
    );
    expect(result.latest).toMatchObject({ state: "known", confidence: "low" });
  });
  it("never touches the network when origin says no", async () => {
    const http = fakeHttp({});
    const result = await resolveNpmLatest(
      "x",
      { query: false, reason: "private default registry configured", evidence: [] },
      netContext(http),
    );
    expect(http.calls).toHaveLength(0);
    expect(result.latest).toMatchObject({
      state: "unknown",
      reason: "private default registry configured",
    });
  });
  it("is unknown offline without cache, and uses cache marked as stale", async () => {
    expect((await resolveNpmLatest("semver", origin, netContext(undefined))).latest).toMatchObject({
      reason: "offline",
    });
    const cache = memoryCache({ [url]: { fetchedAt: 0, body: { version: "7.0.0" } } });
    const stale = await resolveNpmLatest(
      "semver",
      origin,
      netContext(undefined, { cache, now: 10 ** 9 }),
    );
    expect(stale.latest).toMatchObject({ state: "known", value: "7.0.0", confidence: "medium" });
  });
});

describe("cached GET", () => {
  const url = "https://registry.npmjs.org/x/latest";
  it("revalidates an expired entry with If-None-Match and reuses it on 304", async () => {
    const cache = memoryCache({
      [url]: { fetchedAt: 0, etag: '"abc"', body: { version: "1.0.0" } },
    });
    const http = fakeHttp({
      [url]: (h) => ({
        status: h["if-none-match"] === '"abc"' ? 304 : 200,
        headers: {},
        body: undefined,
      }),
    });
    const result = await cachedGet(url, netContext(http, { cache, now: 10 ** 9 }));
    expect(result).toMatchObject({ kind: "revalidated", body: { version: "1.0.0" } });
    expect(cache.entries.get(url)?.fetchedAt).toBe(10 ** 9);
  });
  it("uses a fresh entry without a request", async () => {
    const http = fakeHttp({});
    const cache = memoryCache({ [url]: { fetchedAt: 999_990, body: 1 } });
    expect((await cachedGet(url, netContext(http, { cache }))).kind).toBe("cached");
    expect(http.calls).toHaveLength(0);
  });
  it("returns a stale entry when the network fails", async () => {
    const cache = memoryCache({ [url]: { fetchedAt: 0, body: 1 } });
    const http = fakeHttp({ [url]: new NetworkError("network", "down") });
    expect((await cachedGet(url, netContext(http, { cache, now: 10 ** 9 }))).kind).toBe("stale");
  });
  it("does not cache non-200 responses", async () => {
    const cache = memoryCache();
    await cachedGet(url, netContext(fakeHttp({}), { cache }));
    expect(cache.entries.size).toBe(0);
  });
});

describe("GitHub", () => {
  it("parses remote URLs", () => {
    for (const u of [
      "https://github.com/o/r.git",
      "git@github.com:o/r.git",
      "git+https://github.com/o/r",
      "github:o/r",
      "o/r",
      "ssh://git@github.com/o/r.git",
    ]) {
      expect(parseGithubUrl(u)).toEqual({ owner: "o", repo: "r" });
    }
    expect(parseGithubUrl("https://gitlab.com/o/r")).toBeUndefined();
    expect(parseGithubUrl("https://github.com.evil.com/o/r")).toBeUndefined();
  });

  const base = "https://api.github.com/repos/o/r";
  it("uses the latest release", async () => {
    const http = fakeHttp({ [`${base}/releases/latest`]: json({ tag_name: "v2.0.0" }) });
    const claim = await resolveGithubLatest({ owner: "o", repo: "r" }, netContext(http), {
      rateLimited: false,
      diagnostics: [],
    });
    expect(claim).toMatchObject({ state: "known", value: "2.0.0", confidence: "high" });
  });
  it("falls back to the highest stable semver tag, capped at medium", async () => {
    const http = fakeHttp({
      [`${base}/tags?per_page=100`]: json([
        { name: "v1.0.0" },
        { name: "v3.0.0-rc.1" },
        { name: "v2.1.0" },
        { name: "nightly" },
      ]),
    });
    const claim = await resolveGithubLatest({ owner: "o", repo: "r" }, netContext(http), {
      rateLimited: false,
      diagnostics: [],
    });
    expect(claim).toMatchObject({ state: "known", value: "2.1.0", confidence: "medium" });
  });
  it("stops asking GitHub once the rate limit is reached", async () => {
    const http = fakeHttp({
      [`${base}/releases/latest`]: {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
        body: undefined,
      },
    });
    const state = { rateLimited: false, diagnostics: [] };
    await resolveGithubLatest({ owner: "o", repo: "r" }, netContext(http), state);
    expect(state.rateLimited).toBe(true);
    expect(state.diagnostics).toHaveLength(1);
    await resolveGithubLatest({ owner: "o", repo: "r2" }, netContext(http), state);
    expect(http.calls).toHaveLength(1);
  });
});

describe("git repository files", () => {
  it("parses remotes from config", () => {
    expect(
      parseRemotes('[core]\n\tbare = false\n[remote "origin"]\n\turl = git@github.com:o/r.git\n'),
    ).toEqual([{ name: "origin", url: "git@github.com:o/r.git" }]);
  });
  it("resolves HEAD through packed-refs and finds the GitHub remote", async () => {
    const sha = "a".repeat(40);
    const fs = memoryFs({
      "/r/.git/HEAD": "ref: refs/heads/main\n",
      "/r/.git/packed-refs": `# pack-refs\n${sha} refs/heads/main\n`,
      "/r/.git/config": '[remote "origin"]\n\turl = https://github.com/o/r.git\n',
    });
    const repo = await readRepository(fs, "/r");
    expect(repo).toMatchObject({
      branch: "main",
      commit: sha,
      github: { repo: { owner: "o", repo: "r" } },
    });
  });
  it("follows a .git file for worktrees", async () => {
    const fs = memoryFs({
      "/w/.git": "gitdir: /main/.git/worktrees/w\n",
      "/main/.git/worktrees/w/HEAD": `${"b".repeat(40)}\n`,
      "/main/.git/worktrees/w/commondir": "../..\n",
      "/main/.git/config": "",
    });
    expect(await readRepository(fs, "/w")).toMatchObject({ commit: "b".repeat(40), remotes: [] });
  });
});

describe("project scan", () => {
  it("reads requested, resolved (pnpm v9 lockfile) and installed versions", async () => {
    const fs = memoryFs({
      "/p/package.json": JSON.stringify({
        packageManager: "pnpm@10.0.0",
        dependencies: { a: "^1.0.0" },
        devDependencies: { b: "^2.0.0" },
      }),
      "/p/pnpm-lock.yaml":
        "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      a:\n        specifier: ^1.0.0\n        version: 1.2.0\n    devDependencies:\n      b:\n        specifier: ^2.0.0\n        version: 2.1.0(typescript@5.0.0)\n",
      "/p/node_modules/a/package.json": JSON.stringify({ version: "1.2.0" }),
    });
    const scan = await scanProject(fs, "/p", "/");
    expect(scan.packageManager?.value).toBe("pnpm");
    const a = scan.dependencies.find((d) => d.name === "a");
    const b = scan.dependencies.find((d) => d.name === "b");
    expect(a?.resolved?.version).toBe("1.2.0");
    expect(a?.installed?.version).toBe("1.2.0");
    expect(b?.resolved?.version).toBe("2.1.0");
    expect(b?.installed).toBeUndefined();
  });
  it("reads package-lock.json and infers npm", async () => {
    const fs = memoryFs({
      "/p/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      "/p/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/a": { version: "1.1.0" } },
      }),
    });
    const scan = await scanProject(fs, "/p", "/");
    expect(scan.packageManager).toMatchObject({ value: "npm", evidence: [{ kind: "inference" }] });
    expect(scan.dependencies[0]?.resolved?.version).toBe("1.1.0");
  });
  it("prefers the project's own package-lock.json over a pnpm-lock.yaml above it (F-08)", async () => {
    const fs = memoryFs({
      "/ws/pnpm-lock.yaml":
        "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      a:\n        specifier: ^1.0.0\n        version: 1.9.9\n",
      "/ws/app/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
      "/ws/app/package-lock.json": JSON.stringify({
        lockfileVersion: 3,
        packages: { "": {}, "node_modules/a": { version: "1.2.0" } },
      }),
    });
    const scan = await scanProject(fs, "/ws/app", "/");
    expect(scan.packageManager?.value).toBe("npm");
    expect(scan.dependencies[0]?.resolved).toMatchObject({
      version: "1.2.0",
      evidence: { source: "/ws/app/package-lock.json" },
    });
  });
  it("ignores a pnpm-lock.yaml above the project unless it lists the project (F-08)", async () => {
    const v5 = "lockfileVersion: 5.4\ndependencies:\n  a: 1.9.9\n";
    const fs = memoryFs({
      "/ws/pnpm-lock.yaml": v5,
      "/ws/app/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
    });
    const scan = await scanProject(fs, "/ws/app", "/");
    expect(scan.packageManager).toBeUndefined();
    expect(scan.dependencies[0]).toMatchObject({ resolvedUnknownReason: "no lockfile" });
    expect(scan.dependencies[0]?.resolved).toBeUndefined();
  });
  it("uses a workspace pnpm-lock.yaml that lists the project as an importer", async () => {
    const fs = memoryFs({
      "/ws/pnpm-lock.yaml":
        "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  packages/app:\n    dependencies:\n      a:\n        specifier: ^1.0.0\n        version: 1.3.0\n",
      "/ws/packages/app/package.json": JSON.stringify({ dependencies: { a: "^1.0.0" } }),
    });
    const scan = await scanProject(fs, "/ws/packages/app", "/");
    expect(scan.packageManager?.value).toBe("pnpm");
    expect(scan.dependencies[0]?.resolved?.version).toBe("1.3.0");
  });
  it("marks unsupported lockfiles instead of guessing", async () => {
    const fs = memoryFs({
      "/p/package.json": JSON.stringify({ dependencies: { a: "^1" } }),
      "/p/yarn.lock": "",
    });
    const scan = await scanProject(fs, "/p", "/");
    expect(scan.dependencies[0]?.resolvedUnknownReason).toBe("yarn.lock is not supported yet");
  });
});
