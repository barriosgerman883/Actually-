import { isAbsolute, join, resolve } from "node:path";
import { parse } from "smol-toml";
import { defaultConfig, type Config } from "../../core/config.js";
import { FatalError } from "../../core/errors.js";
import type { Environment, Filesystem } from "../../core/ports.js";

export interface LoadedConfig {
  config: Config;
  /** Unknown keys and other non-fatal problems. */
  warnings: string[];
}

/**
 * Loads the TOML config (docs/design.md §13). A missing file is not an
 * error: defaults apply. A file that exists but cannot be parsed or has
 * wrongly typed values is fatal (exit code 3), because guessing what the
 * user meant could scan or send more than they intended.
 */
export async function loadConfig(
  file: string,
  fs: Filesystem,
  env: Environment,
): Promise<LoadedConfig> {
  const config = defaultConfig();
  // Only a missing file means defaults. One that cannot be checked may say
  // `enabled = false`, so guessing would be less conservative (F-46).
  let present: boolean;
  try {
    present = await fs.exists(file);
  } catch (error) {
    throw new FatalError(`cannot read config file ${file}: ${(error as Error).message}`);
  }
  if (!present) return { config, warnings: [] };

  let raw: Record<string, unknown>;
  try {
    raw = parse(await fs.readText(file)) as Record<string, unknown>;
  } catch (error) {
    throw new FatalError(`cannot parse config file ${file}: ${(error as Error).message}`);
  }
  const warnings: string[] = [];
  const fail = (key: string, expected: string): never => {
    throw new FatalError(`invalid config in ${file}: ${key} must be ${expected}`);
  };
  const expand = (p: string) => {
    const withHome =
      p === "~" ? env.homeDir : p.startsWith("~/") ? join(env.homeDir, p.slice(2)) : p;
    return isAbsolute(withHome) ? withHome : resolve(withHome);
  };
  const table = (key: string, value: unknown): Record<string, unknown> => {
    if (value === undefined) return {};
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail(key, "a table");
    return value as Record<string, unknown>;
  };
  const strings = (key: string, value: unknown): string[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
      fail(key, "a list of strings");
    }
    return value as string[];
  };
  const bool = (key: string, value: unknown): boolean | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") fail(key, "true or false");
    return value as boolean;
  };
  const known = (name: string, t: Record<string, unknown>, keys: string[]) => {
    for (const k of Object.keys(t))
      if (!keys.includes(k)) warnings.push(`unknown config key ${name}.${k}`);
  };

  known("", raw, ["scan", "tools", "network", "cache", "output"]);

  const scan = table("scan", raw.scan);
  known("scan", scan, ["paths", "bin_paths", "depth"]);
  config.scan.paths = (strings("scan.paths", scan.paths) ?? []).map(expand);
  config.scan.binPaths = (strings("scan.bin_paths", scan.bin_paths) ?? []).map(expand);
  if (scan.depth !== undefined) {
    if (
      typeof scan.depth !== "number" ||
      !Number.isInteger(scan.depth) ||
      scan.depth < 1 ||
      scan.depth > 10
    ) {
      fail("scan.depth", "an integer between 1 and 10");
    }
    config.scan.depth = scan.depth as number;
  }

  const tools = table("tools", raw.tools);
  known("tools", tools, ["git"]);
  if (tools.git !== undefined) {
    if (!Array.isArray(tools.git)) fail("tools.git", "a list of tables ([[tools.git]])");
    config.tools.git = (tools.git as unknown[]).map((entry, i) => {
      const t = table(`tools.git[${i}]`, entry);
      if (typeof t.path !== "string") fail(`tools.git[${i}].path`, "a string");
      return { path: expand(t.path as string) };
    });
  }

  const network = table("network", raw.network);
  known("network", network, ["enabled", "exclude", "github_token"]);
  config.network.enabled = bool("network.enabled", network.enabled) ?? config.network.enabled;
  config.network.exclude = strings("network.exclude", network.exclude) ?? [];
  config.network.githubToken =
    bool("network.github_token", network.github_token) ?? config.network.githubToken;

  const cache = table("cache", raw.cache);
  known("cache", cache, ["enabled", "ttl"]);
  config.cache.enabled = bool("cache.enabled", cache.enabled) ?? config.cache.enabled;
  if (cache.ttl !== undefined) {
    const ms = typeof cache.ttl === "string" ? parseDuration(cache.ttl) : undefined;
    if (ms === undefined) fail("cache.ttl", 'a duration such as "30m", "6h" or "1d"');
    config.cache.ttlMs = ms as number;
  }

  const output = table("output", raw.output);
  known("output", output, ["color"]);
  if (output.color !== undefined) {
    if (output.color !== "auto" && output.color !== "always" && output.color !== "never") {
      fail("output.color", '"auto", "always" or "never"');
    }
    config.output.color = output.color as Config["output"]["color"];
  }

  config.file = file;
  return { config, warnings };
}

export function parseDuration(text: string): number | undefined {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(text.trim());
  if (!match) return undefined;
  const n = Number(match[1]);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as "s" | "m" | "h" | "d"
  ];
  return n * unit;
}
