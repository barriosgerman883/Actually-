import { describe, expect, it } from "vitest";
import { claimFrom, confidenceFor, minConfidence } from "../../src/core/confidence.js";
import { notApplicable, type Evidence, type VersionClaims } from "../../src/core/model.js";
import { buildRecord, makeToolId } from "../../src/core/record.js";
import { redactSpec } from "../../src/core/redact.js";
import { deriveStatus, mayBreak, updateTypeOf } from "../../src/core/versions.js";

const fact: Evidence = { kind: "fact", source: "a", description: "x" };
const inf = (source: string): Evidence => ({ kind: "inference", source, description: "y" });
const known = (value: string) => claimFrom(value, [fact]);

function versions(installed?: string, latest?: string, resolved?: string): VersionClaims {
  return {
    requested: notApplicable,
    resolved: resolved ? known(resolved) : notApplicable,
    installed: installed ? known(installed) : { state: "unknown", reason: "r", evidence: [] },
    latest: latest ? known(latest) : { state: "unknown", reason: "r", evidence: [] },
  };
}

describe("redactSpec (F-53)", () => {
  it.each([
    ["https://user:TOKEN@files.corp.example/a.tgz?x=1", "https://files.corp.example/…"],
    ["git+ssh://git@github.com/o/r.git", "git+ssh://github.com/…"],
    ["http://[bad", "http://…"],
  ])("keeps only the scheme and host of %s", (spec, shown) => {
    expect(redactSpec(spec)).toBe(shown);
  });
  it.each(["^1.2.0", "latest", "file:../x", "github:o/r", "npm:other@1"])(
    "leaves %s as it is",
    (spec) => {
      expect(redactSpec(spec)).toBe(spec);
    },
  );
});

describe("confidence rules (architecture.md §6)", () => {
  it("is high with a fact and no contradiction", () => {
    expect(confidenceFor([fact])).toBe("high");
    expect(confidenceFor([fact, inf("b")])).toBe("high");
  });
  it("is medium with two independent inferences", () => {
    expect(confidenceFor([inf("a"), inf("b")])).toBe("medium");
  });
  it("is low with a single inference, or two from the same source", () => {
    expect(confidenceFor([inf("a")])).toBe("low");
    expect(confidenceFor([inf("a"), inf("a")])).toBe("low");
  });
  it("is low when evidence is contradictory, even with facts", () => {
    expect(confidenceFor([fact], { contradicted: true })).toBe("low");
  });
  it("never invents a value without evidence", () => {
    expect(claimFrom("1.0.0", [])).toMatchObject({ state: "unknown" });
  });
  it("caps confidence", () => {
    expect(claimFrom("1", [fact], { cap: "medium" })).toMatchObject({ confidence: "medium" });
  });
  it("takes the minimum", () => {
    expect(minConfidence(["high", "low", "medium"])).toBe("low");
    expect(minConfidence([])).toBeUndefined();
  });
});

describe("updateType and mayBreak (architecture.md §5)", () => {
  it("updateType is purely numeric", () => {
    expect(updateTypeOf("1.0.0", "2.0.0")).toBe("major");
    expect(updateTypeOf("0.2.0", "0.3.0")).toBe("minor");
    expect(updateTypeOf("1.2.3", "1.2.4")).toBe("patch");
  });
  it("mayBreak follows npm's caret rule", () => {
    expect(mayBreak("1.2.0", "2.0.0")).toBe(true);
    expect(mayBreak("1.2.0", "1.9.0")).toBe(false);
    expect(mayBreak("0.2.0", "0.3.0")).toBe(true);
    expect(mayBreak("0.2.0", "0.2.5")).toBe(false);
    expect(mayBreak("0.0.3", "0.0.4")).toBe(true);
  });
});

describe("status derivation", () => {
  it("is current when versions match", () => {
    expect(deriveStatus(versions("1.0.0", "1.0.0")).status).toBe("current");
  });
  it("is outdated with type and mayBreak", () => {
    expect(deriveStatus(versions("0.2.0", "0.3.0"))).toEqual({
      status: "outdated",
      updateType: "minor",
      mayBreak: true,
    });
  });
  it("is warning when local is ahead of latest", () => {
    expect(deriveStatus(versions("2.0.0", "1.0.0")).status).toBe("warning");
  });
  it("is unknown when either side is unknown", () => {
    expect(deriveStatus(versions(undefined, "1.0.0")).status).toBe("unknown");
    expect(deriveStatus(versions("1.0.0", undefined)).status).toBe("unknown");
  });
  it("falls back to resolved when installed is unknown", () => {
    expect(deriveStatus(versions(undefined, "2.0.0", "1.0.0")).status).toBe("outdated");
  });
  it("is error when the provider failed", () => {
    expect(deriveStatus(versions("1.0.0", "1.0.0"), true).status).toBe("error");
  });
});

describe("records", () => {
  it("builds ids from scope, location and name", () => {
    expect(makeToolId({ scope: "global", name: "x", provider: "pnpm" })).toBe("global:pnpm:x");
    expect(makeToolId({ scope: "global", name: "x" })).toBe("global:unknown:x");
    expect(makeToolId({ scope: "project", name: "x", projectRoot: "/p" })).toBe("project:/p:x");
  });
  it("sets updateType and mayBreak only when outdated", () => {
    const base = {
      name: "x",
      scope: "global" as const,
      installation: claimFrom({ provider: "pnpm" }, [fact]),
      source: notApplicable,
      update: notApplicable,
    };
    const outdated = buildRecord({ ...base, versions: versions("1.0.0", "2.0.0") });
    expect(outdated).toMatchObject({
      id: "global:pnpm:x",
      status: "outdated",
      updateType: "major",
      mayBreak: true,
    });
    const current = buildRecord({ ...base, versions: versions("1.0.0", "1.0.0") });
    expect(current.updateType).toBeUndefined();
    expect(current.mayBreak).toBeUndefined();
  });
});
