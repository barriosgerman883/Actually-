/**
 * Ports: the only way providers, scanners and the application reach the
 * outside world. Implementations live in src/infrastructure and are wired
 * in src/composition.ts (docs/architecture.md §3.5, §11).
 */

export interface DirEntry {
  name: string;
  kind: "file" | "directory" | "symlink" | "other";
}

/** Read-only view of the filesystem. */
export interface Filesystem {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<DirEntry[]>;
  realpath(path: string): Promise<string>;
  isDirectory(path: string): Promise<boolean>;
  isExecutableFile(path: string): Promise<boolean>;
}

/**
 * Closed list of exact commands (docs/architecture.md §7). Callers pick
 * an id; they never pass a binary, arguments or environment.
 */
export const ALLOWED_COMMANDS = [
  "pnpm.version",
  "pnpm.root.global",
  "pnpm.bin.global",
  "pnpm.list.global",
  "pnpm.config.list",
  "git.tags.head",
  "git.describe.head",
] as const;

export type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

export interface CommandRequest {
  command: AllowedCommand;
  /** Only for git.* commands: root of the repository to inspect. */
  repository?: string;
}

export type CommandResult =
  | { ok: true; stdout: string }
  | {
      ok: false;
      reason: "not-found" | "timeout" | "failed" | "rejected";
      message: string;
      exitCode?: number;
    };

export interface CommandRunner {
  run(request: CommandRequest): Promise<CommandResult>;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
}

/** Throws NetworkError when the request cannot complete. */
export interface HttpClient {
  getJson(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
}

export interface CacheEntry {
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
  body: unknown;
}

/** Cache of network responses only (docs/architecture.md §14). */
export interface ResponseCache {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

export interface Clock {
  now(): number;
}

export interface Environment {
  platform: string;
  homeDir: string;
  get(name: string): string | undefined;
}
