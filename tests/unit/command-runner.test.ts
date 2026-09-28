import { describe, expect, it } from "vitest";
import { failureResult } from "../../src/infrastructure/command-runner/node-command-runner.js";

describe("command runner failures", () => {
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
});
