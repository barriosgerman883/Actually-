import { devNull } from "node:os";
import { isAbsolute } from "node:path";
import type { AllowedCommand, CommandRequest } from "../../core/ports.js";

interface CommandSpec {
  binary: "pnpm" | "git";
  args: readonly string[];
  cwd: "neutral" | "repository";
}

/**
 * The complete allowlist (docs/architecture.md §7). Each entry is an exact
 * command: no prefixes, no extra arguments, and no argument comes from user
 * data or from a repository. Adding an entry requires an ADR.
 */
export const COMMAND_TABLE: Readonly<Record<AllowedCommand, CommandSpec>> = Object.freeze({
  "pnpm.version": { binary: "pnpm", args: ["--version"], cwd: "neutral" },
  "pnpm.root.global": { binary: "pnpm", args: ["root", "--global"], cwd: "neutral" },
  "pnpm.bin.global": { binary: "pnpm", args: ["bin", "--global"], cwd: "neutral" },
  "pnpm.list.global": {
    binary: "pnpm",
    args: ["list", "--global", "--json", "--depth=0"],
    cwd: "neutral",
  },
  "pnpm.config.list": { binary: "pnpm", args: ["config", "list", "--json"], cwd: "neutral" },
  "git.tags.head": { binary: "git", args: ["tag", "--points-at", "HEAD"], cwd: "repository" },
  "git.describe.head": {
    binary: "git",
    args: ["describe", "--tags", "--long", "HEAD"],
    cwd: "repository",
  },
});

/** Options git always receives before the subcommand. */
const GIT_HARDENING_ARGS = ["-c", "core.fsmonitor=false"] as const;

/** Environment overrides for every git invocation (architecture.md §7). */
function gitHardeningEnv(): Record<string, string> {
  return {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: devNull,
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    // A repository can declare itself a partial clone and point a ref at a
    // missing object. Fetching it would run the repository's own transport
    // configuration, such as core.sshCommand, through a shell.
    GIT_NO_LAZY_FETCH: "1",
    GIT_ALLOW_PROTOCOL: "",
  };
}

/**
 * Environment overrides for every pnpm invocation: no update check (it
 * would contact the network outside the HTTP client), and no corepack
 * auto-pinning, download prompts or downloads. A pnpm shim of Corepack
 * that has not downloaded pnpm yet fails instead of reaching the network,
 * also with --offline (architecture.md §7, F-39).
 */
function pnpmQuietEnv(): Record<string, string> {
  return {
    npm_config_update_notifier: "false",
    COREPACK_ENABLE_AUTO_PIN: "0",
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    COREPACK_ENABLE_NETWORK: "0",
  };
}

export interface Invocation {
  binary: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * Turns a request into the exact process invocation. Pure, so the security
 * tests can check every entry without spawning anything.
 */
export function buildInvocation(
  request: CommandRequest,
  context: { neutralDir: string; baseEnv: Record<string, string | undefined> },
): Invocation | { rejected: string } {
  if (!Object.prototype.hasOwnProperty.call(COMMAND_TABLE, request.command)) {
    return { rejected: `command not in allowlist: ${String(request.command)}` };
  }
  const spec = COMMAND_TABLE[request.command];
  let cwd = context.neutralDir;
  if (spec.cwd === "repository") {
    if (!request.repository || !isAbsolute(request.repository)) {
      return { rejected: `${request.command} requires an absolute repository path` };
    }
    cwd = request.repository;
  } else if (request.repository !== undefined) {
    return { rejected: `${request.command} does not accept a repository` };
  } else if (!isAbsolute(cwd)) {
    return { rejected: `${request.command} requires the neutral directory` };
  }

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(context.baseEnv)) {
    if (value === undefined) continue;
    // Never let the caller's environment redirect git to another repository.
    if (spec.binary === "git" && key.startsWith("GIT_")) continue;
    env[key] = value;
  }
  env.LC_ALL = "C";

  if (spec.binary === "git") {
    Object.assign(env, gitHardeningEnv());
    return { binary: "git", args: [...GIT_HARDENING_ARGS, ...spec.args], cwd, env };
  }
  Object.assign(env, pnpmQuietEnv());
  return { binary: spec.binary, args: [...spec.args], cwd, env };
}
