import { homedir } from "node:os";
import type { Environment } from "../../core/ports.js";

export function nodeEnvironment(): Environment {
  return {
    platform: process.platform,
    homeDir: homedir(),
    get: (name) => {
      const value = process.env[name];
      return value === undefined || value === "" ? undefined : value;
    },
  };
}
