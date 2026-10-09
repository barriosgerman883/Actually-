import { execFile } from "node:child_process";
import type { AllowedCommand, CommandResult, CommandRunner, Filesystem } from "../../core/ports.js";
import { buildInvocation, COMMAND_TABLE } from "./allowlist.js";
import { resolveWindowsCommand, type ResolvedBinary } from "./resolve-binary.js";

const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 16 * 1024 * 1024;

/** Maps a failed execFile call to a result. Pure, so it can be tested alone. */
export function failureResult(
  error: Error,
  stderr: string,
  command: AllowedCommand,
  binary: string,
): CommandResult {
  const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: unknown };
  if (err.code === "ENOENT") {
    return { ok: false, reason: "not-found", message: `${binary} is not installed or not in PATH` };
  }
  // execFile also kills the process when output exceeds maxBuffer.
  if (err.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return { ok: false, reason: "failed", message: `${command} failed: output too large` };
  }
  if (err.killed) return { ok: false, reason: "timeout", message: `${command} timed out` };
  const firstLine = stderr.trim().split(/\r?\n/)[0] ?? "";
  return {
    ok: false,
    reason: "failed",
    message: `${command} failed${firstLine ? `: ${firstLine}` : ""}`,
  };
}

/** A variable of an environment whose names, as on Windows, ignore case. */
function envValue(env: Record<string, string>, name: string): string | undefined {
  return Object.entries(env).find(([key]) => key.toUpperCase() === name)?.[1];
}

/**
 * The only component that spawns processes (RA-001). It runs commands from
 * the allowlist only, never through a shell. Output is returned to the
 * caller and never logged here: `pnpm config list` can contain tokens.
 *
 * On Windows, pnpm is usually a .cmd launcher, which Node.js does not start
 * without a shell: it is found in PATH and read instead (ADR 0009).
 */
export function nodeCommandRunner(options: {
  neutralDir: () => Promise<string>;
  platform?: string;
  /** Reads pnpm's launcher on Windows. */
  fs?: Filesystem;
}): CommandRunner {
  const windows = (options.platform ?? process.platform) === "win32";
  let pnpmOnWindows: Promise<ResolvedBinary> | undefined;
  return {
    async run(request): Promise<CommandResult> {
      // Only pnpm runs in the neutral directory; git runs in the repository.
      let neutralDir = "";
      if (Object.prototype.hasOwnProperty.call(COMMAND_TABLE, request.command)) {
        if (COMMAND_TABLE[request.command].cwd === "neutral") {
          try {
            neutralDir = await options.neutralDir();
          } catch (error) {
            return {
              ok: false,
              reason: "failed",
              message: `${request.command} did not run: no neutral directory (${(error as Error).message})`,
            };
          }
        }
      }
      const invocation = buildInvocation(request, { neutralDir, baseEnv: process.env });
      if ("rejected" in invocation) {
        return { ok: false, reason: "rejected", message: invocation.rejected };
      }
      let file = invocation.binary;
      let args = invocation.args;
      if (windows && invocation.binary === "pnpm") {
        if (!options.fs) {
          return { ok: false, reason: "failed", message: "pnpm cannot be located on Windows" };
        }
        pnpmOnWindows ??= resolveWindowsCommand("pnpm", {
          fs: options.fs,
          path: envValue(invocation.env, "PATH"),
          pathext: envValue(invocation.env, "PATHEXT"),
        });
        const resolved = await pnpmOnWindows;
        if (!resolved.ok) return resolved;
        file = resolved.file;
        args = [...resolved.args, ...invocation.args];
      }
      return new Promise((resolve) => {
        execFile(
          file,
          args,
          {
            cwd: invocation.cwd,
            env: invocation.env,
            timeout: TIMEOUT_MS,
            maxBuffer: MAX_BUFFER,
            windowsHide: true,
            shell: false,
          },
          (error, stdout, stderr) => {
            if (!error) {
              resolve({ ok: true, stdout: String(stdout) });
              return;
            }
            resolve(failureResult(error, String(stderr), request.command, invocation.binary));
          },
        );
      });
    },
  };
}
