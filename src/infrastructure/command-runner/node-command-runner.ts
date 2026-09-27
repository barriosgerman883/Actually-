import { execFile } from "node:child_process";
import type { CommandResult, CommandRunner } from "../../core/ports.js";
import { buildInvocation, COMMAND_TABLE } from "./allowlist.js";

const TIMEOUT_MS = 10_000;
const MAX_BUFFER = 16 * 1024 * 1024;

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
            const err = error as NodeJS.ErrnoException & { killed?: boolean; code?: unknown };
            if (err.code === "ENOENT") {
              resolve({
                ok: false,
                reason: "not-found",
                message: `${invocation.binary} is not installed or not in PATH`,
              });
            } else if (err.killed) {
              resolve({ ok: false, reason: "timeout", message: `${request.command} timed out` });
            } else {
              const firstLine = String(stderr).trim().split("\n")[0] ?? "";
              resolve({
                ok: false,
                reason: "failed",
                message: `${request.command} failed${firstLine ? `: ${firstLine}` : ""}`,
                exitCode: typeof err.code === "number" ? err.code : undefined,
              });
            }
          },
        );
      });
    },
  };
}
