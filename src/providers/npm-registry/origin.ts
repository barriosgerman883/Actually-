import semver from "semver";
import type { Evidence } from "../../core/model.js";
import { isPublicRegistry, type RegistryConfig } from "./registry-config.js";

export type OriginDecision =
  { query: true; evidence: Evidence[] } | { query: false; reason: string; evidence: Evidence[] };

const NON_REGISTRY_PREFIXES = [
  "npm:",
  "workspace:",
  "link:",
  "file:",
  "portal:",
  "patch:",
  "catalog:",
  "git+",
  "git:",
  "github:",
  "gitlab:",
  "bitbucket:",
  "http:",
  "https:",
];

/** True for semver ranges and dist-tags: specs resolved from a registry. */
export function isRegistrySpec(spec: string): boolean {
  const s = spec.trim();
  if (s === "") return false;
  if (NON_REGISTRY_PREFIXES.some((p) => s.toLowerCase().startsWith(p))) return false;
  if (s.includes("/") || s.includes(":")) return false;
  if (semver.validRange(s) !== null) return true;
  return /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(s);
}

export function scopeOf(name: string): string | undefined {
  return name.startsWith("@") ? name.slice(0, name.indexOf("/")) : undefined;
}

function matchesPattern(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

/**
 * Decides whether a package may be queried on registry.npmjs.org
 * (docs/architecture.md §8). All conditions must hold:
 *
 * 1. its spec is a registry spec;
 * 2. the effective default registry is the public one;
 * 3. its scope is not mapped to another registry.
 *
 * Also, when pnpm reports the tarball it was installed from, it must come
 * from the public registry, and the name must not be excluded by config.
 * Anything that cannot be determined means: do not query.
 */
export function decideOrigin(input: {
  name: string;
  /**
   * The declared spec. `undefined` means it could not be found (do not
   * query). `null` means the package is not a declared dependency, such as
   * pnpm itself, so only the registry conditions apply.
   */
  spec: string | undefined | null;
  registry: RegistryConfig;
  exclude?: string[];
  resolvedTarball?: string;
  specSource?: string;
}): OriginDecision {
  const evidence: Evidence[] = [];
  if (input.exclude?.some((p) => matchesPattern(input.name, p))) {
    return { query: false, reason: "excluded by [network] exclude", evidence };
  }
  if (input.spec === undefined) {
    return { query: false, reason: "origin could not be determined: no spec found", evidence };
  }
  if (input.spec !== null) {
    evidence.push({
      kind: "fact",
      source: input.specSource ?? "package.json",
      description: `declared as "${input.spec}"`,
    });
    if (!isRegistrySpec(input.spec)) {
      return { query: false, reason: `not installed from a registry ("${input.spec}")`, evidence };
    }
  }
  if (input.registry.state === "unknown") {
    return {
      query: false,
      reason: `origin could not be determined: ${input.registry.reason}`,
      evidence,
    };
  }
  evidence.push(...input.registry.evidence);
  if (!isPublicRegistry(input.registry.defaultRegistry)) {
    return { query: false, reason: "private default registry configured", evidence };
  }
  const scope = scopeOf(input.name);
  const scopeRegistry = scope ? input.registry.scopes.get(scope) : undefined;
  if (scopeRegistry && !isPublicRegistry(scopeRegistry)) {
    return { query: false, reason: `scope ${scope} is mapped to a private registry`, evidence };
  }
  if (input.resolvedTarball !== undefined) {
    let host: string | undefined;
    try {
      host = new URL(input.resolvedTarball).host;
    } catch {
      host = undefined;
    }
    if (host !== "registry.npmjs.org") {
      return {
        query: false,
        reason: "installed from a tarball outside the public registry",
        evidence,
      };
    }
    evidence.push({
      kind: "fact",
      source: "pnpm list --global --json",
      description: "installed from a registry.npmjs.org tarball",
    });
  }
  return { query: true, evidence };
}
