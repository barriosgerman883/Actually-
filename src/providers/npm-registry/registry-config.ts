import type { Evidence } from "../../core/model.js";

const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

/**
 * Only whether each registry is the public one is kept. A registry URL can
 * carry a credential in its user info, its query or its path, so no part of
 * it is stored or shown (docs/architecture.md §8).
 */
export type RegistryConfig =
  | {
      state: "known";
      defaultPublic: boolean;
      /** "@scope" → whether it maps to the public registry. */
      scopes: Map<string, boolean>;
      evidence: Evidence[];
    }
  | { state: "unknown"; reason: string };

function isPublicRegistry(url: string): boolean {
  const trimmed = url.trim();
  const normalized = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  return normalized.toLowerCase() === PUBLIC_REGISTRY;
}

function describeRegistry(key: string, isPublic: boolean): string {
  const subject = key === "registry" ? "effective default registry" : key;
  return `${subject} is ${isPublic ? "" : "not "}the public registry`;
}

/**
 * Extracts only registry settings from `pnpm config list --json`.
 *
 * The output can contain auth tokens. Only `registry` and `@scope:registry`
 * keys are read, and only whether each is the public registry is kept; every
 * other value is dropped immediately and never logged or stored
 * (docs/architecture.md §8).
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

  const scopes = new Map<string, boolean>();
  for (const [key, value] of Object.entries(record)) {
    const match = /^(@[^:]+):registry$/.exec(key);
    if (match?.[1] && typeof value === "string") scopes.set(match[1], isPublicRegistry(value));
  }
  const defaultPublic = isPublicRegistry(registry);
  return {
    state: "known",
    defaultPublic,
    scopes,
    evidence: [
      {
        kind: "fact",
        source: "pnpm config list --json",
        description: describeRegistry("registry", defaultPublic),
      },
    ],
  };
}

/**
 * Adds a .npmrc that could apply to a project. A registry stays public only
 * while every source agrees: a public value never undoes a private one from
 * another source, because which file wins depends on the package manager
 * (architecture.md §8). Only registry lines are read. A value that uses
 * ${VAR} expansion cannot be resolved safely, so the registry becomes
 * unknown and nothing is queried.
 */
export function applyNpmrc(base: RegistryConfig, text: string, file: string): RegistryConfig {
  if (base.state === "unknown") return base;
  let defaultPublic = base.defaultPublic;
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
    const isPublic = isPublicRegistry(value);
    if (key === "registry") {
      defaultPublic &&= isPublic;
    } else {
      const scope = key.slice(0, key.indexOf(":"));
      scopes.set(scope, (scopes.get(scope) ?? true) && isPublic);
    }
    evidence.push({ kind: "fact", source: file, description: describeRegistry(key, isPublic) });
  }
  return { state: "known", defaultPublic, scopes, evidence };
}
