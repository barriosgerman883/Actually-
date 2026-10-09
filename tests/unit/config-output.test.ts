import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  renderDiagnostics,
  renderExplain,
  renderStatus,
  summaryLine,
} from "../../src/cli/output/human.js";
import { documentJson } from "../../src/cli/output/json.js";
import { createStyle } from "../../src/cli/output/style.js";
import { claimFrom } from "../../src/core/confidence.js";
import { FatalError } from "../../src/core/errors.js";
import { notApplicable, type ToolRecord } from "../../src/core/model.js";
import { buildRecord } from "../../src/core/record.js";
import { appDirs } from "../../src/infrastructure/environment/dirs.js";
import { loadConfig, parseDuration } from "../../src/infrastructure/config/toml-config.js";
import { VERSION } from "../../src/version.js";
import { fakeEnv, memoryFs } from "../helpers/fakes.js";

const fact = {
  kind: "fact" as const,
  source: "pnpm list --global --json",
  description: "lists x@1.0.0",
};

function tool(installed: string, latest: string): ToolRecord {
  const installation = claimFrom({ provider: "pnpm" }, [fact]);
  return buildRecord({
    name: "x",
    scope: "global",
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed: claimFrom(installed, [fact]),
      latest: claimFrom(latest, [
        { kind: "fact", source: "GET registry", description: `dist-tag "latest" is ${latest}` },
      ]),
    },
    installation,
    source: { state: "unknown", reason: "no repository", evidence: [] },
    update: installation,
  });
}

describe("version", () => {
  it("matches package.json", () => {
    expect(VERSION).toBe(JSON.parse(readFileSync("package.json", "utf8")).version);
  });
});

describe("config (design.md §13)", () => {
  const env = fakeEnv("/home/me");
  it("uses defaults when the file does not exist", async () => {
    const { config } = await loadConfig("/home/me/.config/actually/config.toml", memoryFs({}), env);
    expect(config.network).toEqual({ enabled: true, exclude: [], githubToken: false });
    expect(config.file).toBeUndefined();
  });
  it("parses and expands ~", async () => {
    const fs = memoryFs({
      "/c.toml":
        '[scan]\npaths = ["~/projects"]\nbin_paths = ["~/bin"]\n[[tools.git]]\npath = "~/tools/x"\n[network]\nexclude = ["@corp/*"]\n[cache]\nttl = "30m"\n',
    });
    const { config, warnings } = await loadConfig("/c.toml", fs, env);
    expect(config.scan.paths).toEqual(["/home/me/projects"]);
    expect(config.scan.binPaths).toEqual(["/home/me/bin"]);
    expect(config.tools.git).toEqual([{ path: "/home/me/tools/x" }]);
    expect(config.network.exclude).toEqual(["@corp/*"]);
    expect(config.cache.ttlMs).toBe(30 * 60_000);
    expect(warnings).toEqual([]);
  });
  it("warns about unknown keys", async () => {
    const { warnings } = await loadConfig(
      "/c.toml",
      memoryFs({ "/c.toml": "[scan]\npathz = []\n" }),
      env,
    );
    expect(warnings).toEqual(["unknown config key scan.pathz"]);
  });
  it("treats invalid files as fatal", async () => {
    await expect(
      loadConfig("/c.toml", memoryFs({ "/c.toml": "[scan\n" }), env),
    ).rejects.toBeInstanceOf(FatalError);
    await expect(
      loadConfig("/c.toml", memoryFs({ "/c.toml": "[network]\nenabled = 1\n" }), env),
    ).rejects.toBeInstanceOf(FatalError);
  });
  it("parses durations", () => {
    expect(parseDuration("6h")).toBe(6 * 3_600_000);
    expect(parseDuration("1d")).toBe(86_400_000);
    expect(parseDuration("soon")).toBeUndefined();
  });
  it("keeps cache and local state in separate directories", () => {
    const dirs = appDirs(fakeEnv("/home/me"));
    expect(dirs).toEqual({
      cache: "/home/me/.cache/actually",
      state: "/home/me/.local/state/actually",
      configFile: "/home/me/.config/actually/config.toml",
    });
    expect(appDirs(fakeEnv("/home/me", { ACTUALLY_CONFIG: "/x.toml" })).configFile).toBe("/x.toml");
  });
});

describe("JSON contract (design.md §14)", () => {
  it("has schemaVersion and diagnostics, never null, and evidence only for explain", () => {
    const status = JSON.parse(
      documentJson({ tools: [tool("1.0.0", "2.0.0")], diagnostics: [], withEvidence: false }),
    );
    expect(status.schemaVersion).toBe(1);
    expect(status.diagnostics).toEqual([]);
    expect(JSON.stringify(status)).not.toContain("null");
    expect(JSON.stringify(status)).not.toContain("evidence");
    expect(status.tools[0]).toMatchObject({
      id: "global:pnpm:x",
      status: "outdated",
      updateType: "major",
      mayBreak: true,
    });
    expect(status.tools[0].versions.requested).toEqual({ state: "not-applicable" });
    const explain = JSON.parse(
      documentJson({ tools: [tool("1.0.0", "2.0.0")], diagnostics: [], withEvidence: true }),
    );
    expect(explain.tools[0].versions.installed.evidence).toHaveLength(1);
  });
});

describe("human output", () => {
  const opts = { home: "/home/me", verbose: false, style: createStyle(false) };
  it("never relies on symbols alone and has no ANSI codes without color", () => {
    const text = renderStatus(
      { tools: [tool("1.0.0", "2.0.0")], projects: [], diagnostics: [] },
      opts,
    );
    expect(text).toContain("↑ x  update available (major, may break)");
    expect(text.includes("\u001b[")).toBe(false);
  });
  it("abbreviates home as ~ in Windows paths too (F-64)", () => {
    const text = renderDiagnostics(
      [{ severity: "warning", source: "git", message: "C:\\Users\\me\\p\\.git could not be read" }],
      "C:\\Users\\me",
    );
    expect(text).toContain("warning: git: ~\\p\\.git could not be read");
  });
  it("summarizes updates and breaking changes", () => {
    expect(
      summaryLine([tool("1.0.0", "2.0.0"), tool("1.0.0", "1.1.0"), tool("1.0.0", "1.0.0")]),
    ).toBe("2 updates available · 1 may include breaking changes");
  });
  it("explain separates facts, inferences and unknowns", () => {
    const text = renderExplain(tool("1.0.0", "2.0.0"), opts);
    expect(text).toContain("fact");
    expect(text).toContain("Not determined");
    expect(text).toContain("Not applicable");
  });
});
