import { dirname } from "node:path";
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

/** In-memory read-only filesystem. Keys are absolute file paths. */
export function memoryFs(
  files: Record<string, string>,
  extra: { executables?: string[]; symlinks?: Record<string, string> } = {},
): Filesystem {
  const dirs = new Set<string>();
  const all = [
    ...Object.keys(files),
    ...(extra.executables ?? []),
    ...Object.keys(extra.symlinks ?? {}),
  ];
  for (const path of all) {
    let dir = dirname(path);
    while (!dirs.has(dir)) {
      dirs.add(dir);
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  const exes = new Set(extra.executables ?? []);
  const links = extra.symlinks ?? {};
  const isFile = (p: string) => p in files || exes.has(p) || p in links;
  return {
    exists: async (p) => isFile(p) || dirs.has(p),
    readText: async (p) => {
      const content = files[p];
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
      return content;
    },
    readDir: async (p): Promise<DirEntry[]> => {
      if (!dirs.has(p)) throw new Error(`ENOENT: ${p}`);
      const names = new Map<string, DirEntry["kind"]>();
      for (const path of [...all, ...dirs]) {
        if (dirname(path) !== p || path === p) continue;
        const name = path.slice(p.length + 1);
        names.set(name, path in links ? "symlink" : dirs.has(path) ? "directory" : "file");
      }
      return [...names].map(([name, kind]) => ({ name, kind }));
    },
    realpath: async (p) => {
      if (p in links) return links[p] as string;
      if (!isFile(p) && !dirs.has(p)) throw new Error(`ENOENT: ${p}`);
      return p;
    },
    isDirectory: async (p) => dirs.has(p),
    isExecutableFile: async (p) => exes.has(p) || p in links,
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

export function fakeEnv(home = "/home/me", vars: Record<string, string> = {}): Environment {
  return { platform: "linux", homeDir: home, get: (name) => vars[name] };
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
