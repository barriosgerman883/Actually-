import { join } from "node:path";
import type { Environment } from "../../core/ports.js";

/**
 * Directories actually uses. The cache holds network responses only and is
 * disposable (docs/architecture.md §14). Local state holds everything else,
 * such as the first-run notice marker (§3.5).
 */
export interface AppDirs {
  cache: string;
  state: string;
  configFile: string;
}

export function appDirs(env: Environment): AppDirs {
  const home = env.homeDir;
  const configFile = env.get("ACTUALLY_CONFIG");
  if (env.platform === "win32") {
    const local = env.get("LOCALAPPDATA") ?? join(home, "AppData", "Local");
    const roaming = env.get("APPDATA") ?? join(home, "AppData", "Roaming");
    return {
      cache: join(local, "actually", "cache"),
      state: join(local, "actually", "state"),
      configFile: configFile ?? join(roaming, "actually", "config.toml"),
    };
  }
  const configHome = env.get("XDG_CONFIG_HOME") ?? join(home, ".config");
  if (env.platform === "darwin") {
    return {
      cache: join(home, "Library", "Caches", "actually"),
      state: join(home, "Library", "Application Support", "actually"),
      configFile: configFile ?? join(configHome, "actually", "config.toml"),
    };
  }
  return {
    cache: join(env.get("XDG_CACHE_HOME") ?? join(home, ".cache"), "actually"),
    state: join(env.get("XDG_STATE_HOME") ?? join(home, ".local", "state"), "actually"),
    configFile: configFile ?? join(configHome, "actually", "config.toml"),
  };
}
