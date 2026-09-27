import type { Evidence } from "../../core/model.js";

export const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

export type RegistryConfig =
  | {
      state: "known";
      defaultRegistry: string;
      /** "@scope" → registry URL. */
      scopes: Map<string, string>;
      evidence: Evidence[];
    }
  | { state: "unknown"; reason: string };

export function normalizeRegistry(url: string): string {
  const trimmed = url.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function isPublicRegistry(url: string): boolean {
  return normalizeRegistry(url).toLowerCase() === PUBLIC_REGISTRY;
}

/**
 * Extracts only registry settings from `pnpm config list --json`.
 *
 * The output can contain auth tokens. Only `registry` and `@scope:registry`
 * keys are read; every other value is dropped immediately and never logged
 * or stored (docs/architecture.md §8).
 */
export function parsePnpmConfig(stdout: string): RegistryConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { state: "unknown", reason: "pnpm config output could not be parsed" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { state: "unknown", reason: "pnpm config output could not be parsed" };
  }
  const record = parsed as Record<string, unknown>;
  const registry = typeof record.registry === "string" ? record.registry : undefined;
  if (!registry) return { state: "unknown", reason: "pnpm config does not report a registry" };

  const scopes = new Map<string, string>();
  for (const [key, value] of Object.entries(record)) {
    const match = /^(@[^:]+):registry$/.exec(key);
    if (match?.[1] && typeof value === "string") scopes.set(match[1], normalizeRegistry(value));
  }
  return {
    state: "known",
    defaultRegistry: normalizeRegistry(registry),
    scopes,
    evidence: [
      {
        kind: "fact",
        source: "pnpm config list --json",
        description: `effective default registry is ${normalizeRegistry(registry)}`,
      },
    ],
  };
}

/**
 * Applies a project's .npmrc on top of the user's effective config. Only
 * registry lines are read. A value that uses ${VAR} expansion cannot be
 * resolved safely, so the registry becomes unknown and nothing is queried.
 */
export function applyNpmrc(base: RegistryConfig, text: string, file: string): RegistryConfig {
  if (base.state === "unknown") return base;
  let defaultRegistry = base.defaultRegistry;
  const scopes = new Map(base.scopes);
  const evidence = [...base.evidence];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    const isRegistryKey = key === "registry" || /^@[^:]+:registry$/.test(key);
    if (!isRegistryKey) continue;
    if (value.includes("${")) {
      return { state: "unknown", reason: `${file} sets ${key} through an environment variable` };
    }
    if (key === "registry") {
      defaultRegistry = normalizeRegistry(value);
    } else {
      scopes.set(key.slice(0, key.indexOf(":")), normalizeRegistry(value));
    }
    evidence.push({
      kind: "fact",
      source: file,
      description: `${key} is ${normalizeRegistry(value)}`,
    });
  }
  return { state: "known", defaultRegistry, scopes, evidence };
}
