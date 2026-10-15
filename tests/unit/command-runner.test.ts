import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInvocation } from "../../src/infrastructure/command-runner/allowlist.js";
import {
  failureResult,
  nodeCommandRunner,
} from "../../src/infrastructure/command-runner/node-command-runner.js";

describe("command runner failures", () => {
  it("preserves special environment names as own data without a prototype (F-69)", () => {
    for (const command of ["pnpm.version", "git.tags.head"] as const) {
      const baseEnv = JSON.parse(
        '{"__proto__":"literal","constructor":"also literal","PATH":"/bin","git_dir":"/evil"}',
      );
      const invocation = buildInvocation(
        { command, ...(command === "git.tags.head" ? { repository: resolve("repo") } : {}) },
        { neutralDir: resolve("neutral"), baseEnv },
      );
      if ("rejected" in invocation) throw new Error(invocation.rejected);
      expect(Object.getPrototypeOf(invocation.env)).toBeNull();
      expect(Object.hasOwn(invocation.env, "__proto__")).toBe(true);
      expect(invocation.env.__proto__).toBe("literal");
      expect(invocation.env.constructor).toBe("also literal");
      expect(invocation.env.PATH).toBe("/bin");
      expect(invocation.env.git_dir).toBe(command === "git.tags.head" ? undefined : "/evil");
    }
  });

  const fail = (fields: object) =>
    failureResult(Object.assign(new Error("x"), fields), "", "pnpm.list.global", "pnpm");

  it("reports output over maxBuffer as too large, not as a timeout (F-14)", () => {
    expect(fail({ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: true })).toEqual({
      ok: false,
      reason: "failed",
      message: "pnpm.list.global failed: output too large",
    });
  });

  it("still reports a killed process as a timeout and a missing binary as not found", () => {
    expect(fail({ killed: true })).toMatchObject({ reason: "timeout" });
    expect(fail({ code: "ENOENT" })).toMatchObject({ reason: "not-found" });
  });

  it("returns a failure when the program cannot even start, instead of throwing (F-66)", async () => {
    // As Node.js does on Windows with a pnpm.exe that is not a valid program.
    const runner = nodeCommandRunner({
      neutralDir: async () => resolve("/tmp/neutral"),
      platform: "linux",
      execFile: (() => {
        throw Object.assign(new Error("spawn UNKNOWN"), { code: "UNKNOWN" });
      }) as never,
    });
    await expect(runner.run({ command: "pnpm.version" })).resolves.toEqual({
      ok: false,
      reason: "failed",
      message: "pnpm.version failed: pnpm could not be started (UNKNOWN)",
    });
  });
});
