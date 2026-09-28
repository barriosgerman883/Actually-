import { describe, expect, it } from "vitest";
import { EXIT, run, type Io, type RuntimeFactory } from "../../src/cli/run.js";
import { NETWORK_NOTICE, type Runtime } from "../../src/composition.js";
import { claimFrom } from "../../src/core/confidence.js";
import { defaultConfig } from "../../src/core/config.js";
import { FatalError } from "../../src/core/errors.js";
import { notApplicable, type Inventory } from "../../src/core/model.js";
import { buildRecord } from "../../src/core/record.js";
import { fakeEnv } from "../helpers/fakes.js";

const fact = { kind: "fact" as const, source: "s", description: "d" };

function record(name: string, installed: string, latest: string, projectRoot?: string) {
  const installation = claimFrom({ provider: "pnpm" }, [fact]);
  return buildRecord({
    name,
    scope: projectRoot ? "project" : "global",
    projectRoot,
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed: claimFrom(installed, [fact]),
      latest: claimFrom(latest, [fact]),
    },
    installation,
    source: notApplicable,
    update: installation,
  });
}

function harness(inventory: Inventory, options: { notice?: boolean; fatal?: boolean } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    cwd: "/tmp",
    stdoutIsTTY: false,
    noColorEnv: false,
  };
  const factory: RuntimeFactory = async (opts) => {
    if (options.fatal) throw new FatalError("cannot parse config file /c.toml");
    const runtime: Runtime = {
      config: defaultConfig(),
      configWarnings: [],
      env: fakeEnv("/home/me"),
      inventory: async () => {
        if (options.notice) opts.notice(NETWORK_NOTICE);
        return inventory;
      },
    };
    return runtime;
  };
  return { out, err, go: (argv: string[]) => run(argv, io, factory) };
}

const inventory: Inventory = {
  tools: [
    record("a", "1.0.0", "2.0.0"),
    record("b", "1.0.0", "1.0.0"),
    record("a", "1.0.0", "1.0.0", "/p"),
  ],
  projects: [],
  diagnostics: [{ severity: "warning", source: "github", message: "GitHub rate limit reached" }],
};

describe("cli", () => {
  it("prints help and version", async () => {
    const h = harness(inventory);
    expect(await h.go(["--help"])).toBe(EXIT.ok);
    expect(h.out.join("")).toContain("actually explain <tool>");
    expect(await h.go(["-v"])).toBe(EXIT.ok);
  });

  it("status exits 0 even with updates, and 1 with --exit-code", async () => {
    expect(await harness(inventory).go(["status"])).toBe(EXIT.ok);
    expect(await harness(inventory).go(["status", "--exit-code"])).toBe(EXIT.updates);
    expect(
      await harness({ ...inventory, tools: [record("b", "1.0.0", "1.0.0")] }).go(["--exit-code"]),
    ).toBe(EXIT.ok);
  });

  it("keeps stdout clean JSON, with the diagnostics inside it, and the notice on stderr", async () => {
    const h = harness(inventory, { notice: true });
    expect(await h.go(["status", "--json"])).toBe(EXIT.ok);
    const doc = JSON.parse(h.out.join(""));
    expect(doc.schemaVersion).toBe(1);
    expect(doc.diagnostics).toHaveLength(1);
    expect(h.out.join("")).not.toContain("checks online");
    expect(h.err.join("")).toContain("checks online");
  });

  it("reports ambiguous names as usage errors, with JSON when asked", async () => {
    const h = harness(inventory);
    expect(await h.go(["explain", "a", "--json"])).toBe(EXIT.usage);
    const doc = JSON.parse(h.out.join(""));
    expect(doc.tools).toEqual([]);
    expect(doc.diagnostics[0].message).toContain("global:pnpm:a");
    expect(await harness(inventory).go(["explain", "global:pnpm:a"])).toBe(EXIT.ok);
    // The ids go one per line in the human output, not as escaped \x0a (F-51).
    const human = harness(inventory);
    expect(await human.go(["explain", "a"])).toBe(EXIT.usage);
    const err = human.err.join("");
    expect(err).not.toContain("\\x0a");
    expect(err).toMatch(/Pass one of these ids:\n {2}global:pnpm:a\n {2}\S+:a\n/);
  });

  it("explain --json includes evidence; status <tool> --json does not", async () => {
    const e = harness(inventory);
    await e.go(["explain", "b", "--json"]);
    expect(JSON.parse(e.out.join("")).tools[0].versions.installed.evidence).toBeDefined();
    const s = harness(inventory);
    await s.go(["status", "b", "--json"]);
    expect(JSON.parse(s.out.join("")).tools[0].versions.installed.evidence).toBeUndefined();
  });

  it("rejects unknown flags, commands and flag combinations", async () => {
    expect(await harness(inventory).go(["--nope"])).toBe(EXIT.usage);
    expect(await harness(inventory).go(["install", "x"])).toBe(EXIT.usage);
    expect(await harness(inventory).go(["--global", "--project"])).toBe(EXIT.usage);
    expect(await harness(inventory).go(["explain"])).toBe(EXIT.usage);
  });

  it("fatal errors exit 3 and still emit valid JSON", async () => {
    const h = harness(inventory, { fatal: true });
    expect(await h.go(["status", "--json"])).toBe(EXIT.fatal);
    expect(JSON.parse(h.out.join("")).diagnostics[0].severity).toBe("error");
    expect(h.err.join("")).toContain("cannot parse config file");
  });
});
