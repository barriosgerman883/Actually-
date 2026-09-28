import { execFile } from "node:child_process";
import type { AllowedCommand, CommandResult, CommandRunner } from "../../core/ports.js";
import { buildInvocation, COMMAND_TABLE } from "./allowlist.js";

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
  const firstLine = stderr.trim().split("\n")[0] ?? "";
  return {
    ok: false,
    reason: "failed",
    message: `${command} failed${firstLine ? `: ${firstLine}` : ""}`,
    exitCode: typeof err.code === "number" ? err.code : undefined,
  };
}

/**
 * The only component that spawns processes (RA-001). It runs commands from
 * the allowlist only, never through a shell. Output is returned to the
 * caller and never logged here: `pnpm config list` can contain tokens.
 */
export function nodeCommandRunner(options: { neutralDir: () => Promise<string> }): CommandRunner {
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
      return new Promise((resolve) => {
        execFile(
          invocation.binary,
          invocation.args,
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
