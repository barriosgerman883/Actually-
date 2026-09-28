import semver from "semver";
import type { Evidence } from "../../core/model.js";
import type { RegistryConfig } from "./registry-config.js";

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

/** npm treats a spec ending like a tarball as a local file (npm-package-arg). */
const TARBALL = /\.(tgz|tar\.gz|tar)$/i;

/** True for semver ranges and dist-tags: specs resolved from a registry. */
export function isRegistrySpec(spec: string): boolean {
  const s = spec.trim();
  if (s === "") return false;
  if (NON_REGISTRY_PREFIXES.some((p) => s.toLowerCase().startsWith(p))) return false;
  if (TARBALL.test(s)) return false;
  if (s.includes("/") || s.includes(":")) return false;
  if (semver.validRange(s) !== null) return true;
  return /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(s);
}

function scopeOf(name: string): string | undefined {
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
 * 2. neither its workspace nor its lockfile resolves it to something local;
 * 3. every source of configuration makes the default registry the public one;
 * 4. no source maps its scope to another registry.
 *
 * Also, when pnpm or the lockfile reports the tarball it comes from, it must
 * come from the public registry, and the name must not be excluded by
 * config. Anything that cannot be determined means: do not query.
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
  /** Set when its workspace or its lockfile resolves it to something local. */
  local?: { reason: string; evidence: Evidence };
  /** The tarball it comes from, and the file or command that reports it. */
  tarball?: { url: string; source: string };
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
  if (input.local) {
    evidence.push(input.local.evidence);
    return { query: false, reason: input.local.reason, evidence };
  }
  if (input.registry.state === "unknown") {
    return {
      query: false,
      reason: `origin could not be determined: ${input.registry.reason}`,
      evidence,
    };
  }
  evidence.push(...input.registry.evidence);
  if (!input.registry.defaultPublic) {
    return { query: false, reason: "private default registry configured", evidence };
  }
  const scope = scopeOf(input.name);
  if (scope && input.registry.scopes.get(scope) === false) {
    return { query: false, reason: `scope ${scope} is mapped to a private registry`, evidence };
  }
  if (input.tarball !== undefined) {
    let host: string | undefined;
    try {
      host = new URL(input.tarball.url).host;
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
      source: input.tarball.source,
      description: "installed from a registry.npmjs.org tarball",
    });
  }
  return { query: true, evidence };
}
