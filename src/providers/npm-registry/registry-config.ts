import { parse as parseYaml } from "yaml";
import type { Evidence } from "../../core/model.js";

const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

/** A file that can set the registry of a project (architecture.md §8). */
export interface RegistryFile {
  path: string;
  text: string;
  format: "npmrc" | "yarnrc" | "yarnrc.yml";
}

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

function describeRegistry(subject: string, isPublic: boolean): string {
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
        description: describeRegistry("effective default registry", defaultPublic),
      },
    ],
  };
}

function unquote(text: string): string {
  return text
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .trim();
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
    // ini accepts quoted keys, such as "@corp:registry"=… (F-34).
    const key = unquote(eq < 0 ? line : line.slice(0, eq));
    const isRegistryKey = key === "registry" || /^@[^:\s]+:registry$/.test(key);
    if (!isRegistryKey) {
      // A key that names a registry but does not have a form npm reads the
      // same way leaves the registry unknown instead of being ignored (F-34).
      if (/(^|:)\s*registry$/i.test(key)) {
        return { state: "unknown", reason: `${file} has a registry line that cannot be read` };
      }
      continue;
    }
    if (eq < 0) {
      return { state: "unknown", reason: `${file} has a registry line that cannot be read` };
    }
    const value = unquote(line.slice(eq + 1));
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

/** One registry setting from a source other than pnpm: a file or an environment variable. */
function applySetting(
  base: RegistryConfig,
  setting: { key: string; value: unknown; source: string; scope?: string },
): RegistryConfig {
  if (base.state === "unknown") return base;
  const { key, value, source, scope } = setting;
  if (typeof value !== "string") {
    return { state: "unknown", reason: `${source} sets ${key} to something that is not a URL` };
  }
  if (value.includes("${")) {
    return { state: "unknown", reason: `${source} sets ${key} through an environment variable` };
  }
  const isPublic = isPublicRegistry(value);
  const scopes = new Map(base.scopes);
  if (scope) scopes.set(scope, (scopes.get(scope) ?? true) && isPublic);
  return {
    state: "known",
    defaultPublic: scope ? base.defaultPublic : base.defaultPublic && isPublic,
    scopes,
    evidence: [
      ...base.evidence,
      { kind: "fact", source, description: describeRegistry(key, isPublic) },
    ],
  };
}

/**
 * Adds a yarn berry `.yarnrc.yml`: `npmRegistryServer` and
 * `npmScopes.<scope>.npmRegistryServer`. yarn berry does not read .npmrc,
 * so these are the only files that set its registry. A file that cannot be
 * parsed leaves the registry unknown (F-52).
 */
export function applyYarnrcYml(base: RegistryConfig, text: string, file: string): RegistryConfig {
  if (base.state === "unknown") return base;
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return { state: "unknown", reason: `${file} could not be parsed` };
  }
  if (doc === null || doc === undefined) return base;
  if (typeof doc !== "object" || Array.isArray(doc)) {
    return { state: "unknown", reason: `${file} could not be parsed` };
  }
  const record = doc as Record<string, unknown>;
  let config: RegistryConfig = base;
  if ("npmRegistryServer" in record) {
    config = applySetting(config, {
      key: "npmRegistryServer",
      value: record.npmRegistryServer,
      source: file,
    });
  }
  const npmScopes = record.npmScopes;
  if (npmScopes !== undefined) {
    if (typeof npmScopes !== "object" || npmScopes === null || Array.isArray(npmScopes)) {
      return { state: "unknown", reason: `${file} has an npmScopes entry that cannot be read` };
    }
    for (const [name, settings] of Object.entries(npmScopes as Record<string, unknown>)) {
      if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
        return { state: "unknown", reason: `${file} has an npmScopes entry that cannot be read` };
      }
      const value = (settings as Record<string, unknown>).npmRegistryServer;
      if (value === undefined) continue;
      config = applySetting(config, {
        key: `npmScopes.${name}.npmRegistryServer`,
        value,
        source: file,
        scope: `@${name}`,
      });
    }
  }
  return config;
}

/**
 * Adds a yarn classic `.yarnrc`: lines `registry "url"` and
 * `"@scope:registry" "url"`, with optional quotes (F-52).
 */
export function applyYarnrc(base: RegistryConfig, text: string, file: string): RegistryConfig {
  let config: RegistryConfig = base;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^"?([^"\s]+)"?\s+"?([^"\s]*)"?$/.exec(line);
    if (!match) continue;
    const [, key = "", value = ""] = match;
    if (key === "registry") {
      config = applySetting(config, { key, value, source: file });
    } else if (/^@[^:]+:registry$/.test(key)) {
      config = applySetting(config, { key, value, source: file, scope: key.slice(0, -9) });
    }
  }
  return config;
}

export function applyRegistryFile(base: RegistryConfig, file: RegistryFile): RegistryConfig {
  switch (file.format) {
    case "npmrc":
      return applyNpmrc(base, file.text, file.path);
    case "yarnrc":
      return applyYarnrc(base, file.text, file.path);
    case "yarnrc.yml":
      return applyYarnrcYml(base, file.text, file.path);
  }
}

/** `YARN_NPM_REGISTRY_SERVER`, which yarn berry reads before its files. */
export function applyYarnEnvironment(
  base: RegistryConfig,
  value: string | undefined,
): RegistryConfig {
  if (value === undefined) return base;
  return applySetting(base, {
    key: "npmRegistryServer",
    value,
    source: "YARN_NPM_REGISTRY_SERVER",
  });
}
