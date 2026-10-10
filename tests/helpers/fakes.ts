import { basename, dirname, resolve } from "node:path";
import { defaultConfig, type Config } from "../../src/core/config.js";
import { NetworkError } from "../../src/core/errors.js";
import type {
  AllowedCommand,
  CacheEntry,
  CommandResult,
  CommandRunner,
  DirEntry,
  Environment,
  Filesystem,
  HttpClient,
  HttpResponse,
  ResponseCache,
} from "../../src/core/ports.js";
import type { NetContext } from "../../src/providers/shared/cached-get.js";

/**
 * A test path in the platform's own form: `/home/me/x` stays as it is on
 * Linux and macOS, and becomes `D:\home\me\x` on Windows, as node:path
 * would build it. Write paths in tests as p("/home/me/x").
 */
export const p = (posix: string): string => resolve(posix);

/**
 * In-memory read-only filesystem. Keys are absolute file paths; keys and
 * queries both go through p(), so "/home/me/x" works on every platform.
 */
export function memoryFs(
  files: Record<string, string>,
  extra: { executables?: string[]; symlinks?: Record<string, string> } = {},
): Filesystem {
  const contents = new Map(Object.entries(files).map(([path, text]) => [p(path), text]));
  const exes = new Set((extra.executables ?? []).map(p));
  const links = new Map(Object.entries(extra.symlinks ?? {}).map(([from, to]) => [p(from), p(to)]));
  const all = [...contents.keys(), ...exes, ...links.keys()];
  const dirs = new Set<string>();
  for (const path of all) {
    let dir = dirname(path);
    while (!dirs.has(dir)) {
      dirs.add(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  const isFile = (path: string) => contents.has(path) || exes.has(path) || links.has(path);
  return {
    exists: async (path) => isFile(p(path)) || dirs.has(p(path)),
    readText: async (path) => {
      const content = contents.get(p(path));
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      return content;
    },
    readDir: async (path): Promise<DirEntry[]> => {
      const dir = p(path);
      if (!dirs.has(dir)) throw new Error(`ENOENT: ${path}`);
      const names = new Map<string, DirEntry["kind"]>();
      for (const entry of [...all, ...dirs]) {
        if (dirname(entry) !== dir || entry === dir) continue;
        names.set(
          basename(entry),
          links.has(entry) ? "symlink" : dirs.has(entry) ? "directory" : "file",
        );
      }
      return [...names].map(([name, kind]) => ({ name, kind }));
    },
    realpath: async (path) => {
      const full = p(path);
      const target = links.get(full);
      if (target !== undefined) return target;
      if (!isFile(full) && !dirs.has(full)) throw new Error(`ENOENT: ${path}`);
      return full;
    },
    isDirectory: async (path) => dirs.has(p(path)),
    isExecutableFile: async (path) => exes.has(p(path)) || links.has(p(path)),
  };
}

export type RunnerScript = Partial<
  Record<AllowedCommand, CommandResult | ((repository?: string) => CommandResult)>
>;

export function fakeRunner(
  script: RunnerScript,
): CommandRunner & { calls: { command: AllowedCommand; repository?: string }[] } {
  const calls: { command: AllowedCommand; repository?: string }[] = [];
  return {
    calls,
    async run(request) {
      calls.push({ command: request.command, repository: request.repository });
      const entry = script[request.command];
      if (entry === undefined)
        return { ok: false, reason: "not-found", message: `${request.command} not scripted` };
      return typeof entry === "function" ? entry(request.repository) : entry;
    },
  };
}

export const ok = (stdout: string): CommandResult => ({ ok: true, stdout });

export type Route =
  HttpResponse | NetworkError | ((headers: Record<string, string>) => HttpResponse);

export function fakeHttp(
  routes: Record<string, Route>,
): HttpClient & { calls: { url: string; headers: Record<string, string> }[] } {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  return {
    calls,
    async getJson(url, options = {}) {
      const headers = options.headers ?? {};
      calls.push({ url, headers });
      const route = routes[url];
      if (route === undefined) return { status: 404, headers: {}, body: undefined };
      if (route instanceof NetworkError) throw route;
      return typeof route === "function" ? route(headers) : route;
    },
  };
}

export const json = (body: unknown, headers: Record<string, string> = {}): HttpResponse => ({
  status: 200,
  headers: { "content-type": "application/json", ...headers },
  body,
});

export function memoryCache(
  initial: Record<string, CacheEntry> = {},
): ResponseCache & { entries: Map<string, CacheEntry> } {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, entry) => {
      entries.set(key, entry);
    },
  };
}

export function netContext(
  http: HttpClient | undefined,
  options: { cache?: ResponseCache; now?: number; ttlMs?: number } = {},
): NetContext {
  return {
    http,
    cache: options.cache ?? memoryCache(),
    clock: { now: () => options.now ?? 1_000_000 },
    ttlMs: options.ttlMs ?? 60_000,
  };
}

/** Home goes through p(), as memoryFs keys do. */
export function fakeEnv(home = "/home/me", vars: Record<string, string> = {}): Environment {
  return { platform: "linux", homeDir: p(home), get: (name) => vars[name] };
}

export function config(patch: (c: Config) => void = () => {}): Config {
  const c = defaultConfig();
  patch(c);
  return c;
}

export const PNPM_CONFIG_PUBLIC = JSON.stringify({
  registry: "https://registry.npmjs.org/",
  "//registry.npmjs.org/:_authToken": "npm_SECRET_TOKEN",
});
