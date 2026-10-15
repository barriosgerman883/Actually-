/** Parsed configuration (docs/design.md §13). All paths are absolute. */
export interface Config {
  scan: {
    paths: string[];
    binPaths: string[];
    /** Maximum directory depth below each scan path. */
    depth: number;
  };
  tools: {
    git: { path: string }[];
  };
  network: {
    enabled: boolean;
    exclude: string[];
    githubToken: boolean;
  };
  cache: {
    enabled: boolean;
    ttlMs: number;
  };
  output: {
    color: "auto" | "always" | "never";
  };
  /** Config file that was loaded, if any. */
  file?: string;
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export function defaultConfig(): Config {
  return {
    scan: { paths: [], binPaths: [], depth: 3 },
    tools: { git: [] },
    network: { enabled: true, exclude: [], githubToken: false },
    cache: { enabled: true, ttlMs: DEFAULT_TTL_MS },
    output: { color: "auto" },
  };
}
