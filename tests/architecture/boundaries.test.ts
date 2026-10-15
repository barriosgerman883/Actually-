import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture rules RA-001…RA-010 (docs/architecture.md §12), checked on
 * the source text so a violation fails CI before it can ship.
 */

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
  });
}

const sources = files("src").map((path) => {
  const text = readFileSync(path, "utf8");
  const imports = [
    ...text.matchAll(
      /(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g,
    ),
  ].map((m) => (m[1] ?? m[2]) as string);
  return { path: relative("src", path).split("\\").join("/"), text, imports };
});

function violations(rule: (s: (typeof sources)[number]) => string | undefined): string[] {
  return sources.flatMap((s) => {
    const v = rule(s);
    return v ? [`${s.path}: ${v}`] : [];
  });
}

const layer = (path: string) => path.split("/")[0] ?? "";
const importsMatching = (s: (typeof sources)[number], re: RegExp) =>
  s.imports.filter((i) => re.test(i));

describe("architecture rules", () => {
  it("RA-001: only infrastructure/command-runner spawns processes", () => {
    expect(
      violations((s) =>
        !s.path.startsWith("infrastructure/command-runner/") &&
        importsMatching(s, /^(node:)?child_process$/).length
          ? "imports child_process"
          : undefined,
      ),
    ).toEqual([]);
  });

  it("RA-002/RA-010: only filesystem, cache and local-state touch node:fs", () => {
    const allowed = [
      "infrastructure/filesystem/",
      "infrastructure/cache/",
      "infrastructure/local-state/",
    ];
    expect(
      violations((s) =>
        !allowed.some((a) => s.path.startsWith(a)) &&
        importsMatching(s, /^(node:)?fs(\/promises)?$/).length
          ? "imports fs"
          : undefined,
      ),
    ).toEqual([]);
  });

  it("RA-010: only cache and local-state write to disk", () => {
    const writers =
      /\b(writeFile|appendFile|mkdir|mkdtemp|rename|rm|rmdir|unlink|copyFile|symlink|chmod|createWriteStream)(Sync)?\s*\(/;
    const allowed = ["infrastructure/cache/", "infrastructure/local-state/"];
    expect(
      violations((s) =>
        !allowed.some((a) => s.path.startsWith(a)) &&
        writers.test(s.text.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ""))
          ? "writes to disk"
          : undefined,
      ),
    ).toEqual([]);
  });

  it("RA-003: only infrastructure/http uses the network", () => {
    expect(
      violations((s) => {
        if (s.path.startsWith("infrastructure/http/")) return undefined;
        if (
          importsMatching(s, /^(undici|axios|node-fetch|(node:)?(http|https|net|tls|dgram))$/)
            .length
        )
          return "imports a network module";
        if (/\bfetch\s*\(/.test(s.text)) return "calls fetch";
        return undefined;
      }),
    ).toEqual([]);
  });

  it("RA-004: core depends on nothing outside core (pure libraries only)", () => {
    expect(
      violations((s) => {
        if (layer(s.path) !== "core") return undefined;
        const bad = s.imports.filter((i) =>
          i.startsWith(".") ? !i.startsWith("./") : !["semver"].includes(i),
        );
        return bad.length ? `imports ${bad.join(", ")}` : undefined;
      }),
    ).toEqual([]);
  });

  it("providers, scanners and application never import infrastructure", () => {
    expect(
      violations((s) =>
        ["providers", "scanners", "application"].includes(layer(s.path)) &&
        s.imports.some((i) => i.includes("/infrastructure/"))
          ? "imports infrastructure"
          : undefined,
      ),
    ).toEqual([]);
  });

  it("RA-005/RA-006: providers do not print; the CLI does not detect", () => {
    expect(
      violations((s) =>
        ["providers", "scanners", "application", "core"].includes(layer(s.path)) &&
        /\b(console\.|process\.(stdout|stderr))/.test(s.text)
          ? "prints output"
          : undefined,
      ),
    ).toEqual([]);
    expect(
      violations((s) =>
        layer(s.path) === "cli" &&
        s.imports.some((i) => /\/(providers|scanners|infrastructure)\//.test(i))
          ? "cli reaches below application"
          : undefined,
      ),
    ).toEqual([]);
  });

  it("only the CLI, infrastructure and the composition root read process state", () => {
    expect(
      violations((s) =>
        ["providers", "scanners", "application", "core"].includes(layer(s.path)) &&
        /\bprocess\.(env|cwd|argv|exit)/.test(s.text)
          ? "reads process state"
          : undefined,
      ),
    ).toEqual([]);
  });

  it("nothing spawns through a shell", () => {
    expect(
      violations((s) => (/shell:\s*true/.test(s.text) ? "uses shell: true" : undefined)),
    ).toEqual([]);
  });
});
