import semver from "semver";
import { claimFrom } from "../../core/confidence.js";
import type { Claim, Evidence } from "../../core/model.js";
import { cachedGet, staleEvidenceText, type NetContext } from "../shared/cached-get.js";
import type { OriginDecision } from "./origin.js";

export interface NpmLatest {
  latest: Claim<string>;
  /** Raw `repository` field of the latest manifest, if any. */
  repository?: string;
}

const NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9._~-][a-z0-9._~-]*$/i;

export function latestUrl(name: string): string | undefined {
  if (!NAME.test(name) || name.includes("..")) return undefined;
  const encoded = name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1, name.indexOf("/")))}%2F${encodeURIComponent(name.slice(name.indexOf("/") + 1))}`
    : encodeURIComponent(name);
  return `https://registry.npmjs.org/${encoded}/latest`;
}

function repositoryOf(body: Record<string, unknown>): string | undefined {
  const repo = body.repository;
  if (typeof repo === "string") return repo;
  if (
    typeof repo === "object" &&
    repo !== null &&
    typeof (repo as { url?: unknown }).url === "string"
  ) {
    return (repo as { url: string }).url;
  }
  return undefined;
}

/**
 * Resolves the version behind the `latest` dist-tag. That tag is chosen by
 * the publisher: using it for the latest stable release is a convention,
 * so the evidence names the dist-tag, and a prerelease under it lowers the
 * claim to `low` (docs/architecture.md §5).
 */
export async function resolveNpmLatest(
  name: string,
  origin: OriginDecision,
  ctx: NetContext,
): Promise<NpmLatest> {
  if (!origin.query) {
    return { latest: { state: "unknown", reason: origin.reason, evidence: origin.evidence } };
  }
  const url = latestUrl(name);
  if (!url) return { latest: { state: "unknown", reason: "invalid package name", evidence: [] } };

  const result = await cachedGet(url, ctx);
  if (result.kind === "offline-miss") {
    return { latest: { state: "unknown", reason: "offline", evidence: [] } };
  }
  if (result.kind === "error") {
    return { latest: { state: "unknown", reason: result.error.message, evidence: [] } };
  }
  if (result.kind !== "stale" && result.status === 404) {
    return {
      latest: {
        state: "unknown",
        reason: "not found in the public registry",
        evidence: [{ kind: "fact", source: `GET ${url}`, description: "404 not found" }],
      },
    };
  }
  if (result.kind !== "stale" && result.status !== 200) {
    return {
      latest: { state: "unknown", reason: `registry answered ${result.status}`, evidence: [] },
    };
  }
  const body = result.body as Record<string, unknown> | undefined;
  const version = typeof body?.version === "string" ? body.version : undefined;
  if (!version || !semver.valid(version)) {
    return {
      latest: { state: "unknown", reason: "registry response has no valid version", evidence: [] },
    };
  }
  const evidence: Evidence[] = [
    { kind: "fact", source: `GET ${url}`, description: `dist-tag "latest" is ${version}` },
  ];
  const prerelease = semver.prerelease(version) !== null;
  if (prerelease) {
    evidence.push({
      kind: "inference",
      source: "semver",
      description: `${version} is a prerelease, so it may not be a stable release`,
    });
  }
  if (result.kind === "stale") {
    evidence.push({
      kind: "fact",
      source: "cache",
      description: staleEvidenceText(result.fetchedAt, result.cause),
    });
  } else if (result.kind === "cached") {
    evidence.push({
      kind: "fact",
      source: "cache",
      description: `cached response from ${new Date(result.fetchedAt).toISOString()}`,
    });
  }
  return {
    latest: claimFrom(version, evidence, {
      contradicted: prerelease,
      cap: result.kind === "stale" ? "medium" : undefined,
    }),
    repository: body ? repositoryOf(body) : undefined,
  };
}
