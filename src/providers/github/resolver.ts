import semver from "semver";
import { claimFrom } from "../../core/confidence.js";
import type { Claim, Diagnostic, Evidence } from "../../core/model.js";
import {
  cachedGet,
  staleEvidenceText,
  type CachedGetResult,
  type NetContext,
} from "../shared/cached-get.js";
import type { GithubRepo } from "./url.js";

/** Shared across one run: once GitHub says the quota is gone, stop asking. */
export interface GithubRunState {
  rateLimited: boolean;
  diagnostics: Diagnostic[];
}

const HEADERS = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };

function isRateLimited(result: CachedGetResult): boolean {
  if (result.kind !== "fresh") return false;
  if (result.status === 429) return true;
  return result.status === 403 && result.headers["x-ratelimit-remaining"] === "0";
}

function cacheEvidence(result: CachedGetResult): Evidence[] {
  if (result.kind === "stale")
    return [
      {
        kind: "fact",
        source: "cache",
        description: staleEvidenceText(result.fetchedAt, result.cause),
      },
    ];
  if (result.kind === "cached")
    return [
      {
        kind: "fact",
        source: "cache",
        description: `cached response from ${new Date(result.fetchedAt).toISOString()}`,
      },
    ];
  return [];
}

function version(tag: string): string | undefined {
  return semver.valid(tag.trim().replace(/^v/, "")) ?? undefined;
}

/**
 * Resolves the latest version of a GitHub repository (docs/mvp.md §5.4):
 * 1. the latest release, which GitHub never reports for drafts or
 *    prereleases; 2. otherwise the highest semver tag; 3. otherwise unknown.
 * HEAD of the default branch is never treated as a version.
 */
export async function resolveGithubLatest(
  repo: GithubRepo,
  ctx: NetContext,
  state: GithubRunState,
): Promise<Claim<string>> {
  if (state.rateLimited)
    return { state: "unknown", reason: "GitHub rate limit reached", evidence: [] };
  const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;

  const release = await cachedGet(`${base}/releases/latest`, ctx, HEADERS);
  if (release.kind === "offline-miss") return { state: "unknown", reason: "offline", evidence: [] };
  if (release.kind === "error")
    return { state: "unknown", reason: release.error.message, evidence: [] };
  if (isRateLimited(release)) {
    state.rateLimited = true;
    state.diagnostics.push({
      severity: "warning",
      source: "github",
      message: "GitHub rate limit reached; remaining GitHub versions are unknown",
    });
    return { state: "unknown", reason: "GitHub rate limit reached", evidence: [] };
  }
  const releaseStatus = release.kind === "stale" ? 200 : release.status;
  // What the releases endpoint said, for the evidence of the tag fallback.
  let releaseNote = "no releases";
  if (releaseStatus === 200) {
    const tag = (release.body as { tag_name?: unknown } | undefined)?.tag_name;
    const v = typeof tag === "string" ? version(tag) : undefined;
    if (typeof tag === "string" && v) {
      // A release its publisher did not mark as a prerelease can still carry
      // a prerelease tag, which contradicts "stable" (architecture.md §5, F-36).
      const prerelease = semver.prerelease(v) !== null;
      return claimFrom(
        v,
        [
          {
            kind: "fact",
            source: `GET ${base}/releases/latest`,
            description: `latest release is tagged ${tag}`,
          },
          ...(prerelease
            ? [
                {
                  kind: "inference" as const,
                  source: "semver",
                  description: `${v} is a prerelease, so it may not be a stable release`,
                },
              ]
            : []),
          ...cacheEvidence(release),
        ],
        { contradicted: prerelease, cap: release.kind === "stale" ? "medium" : undefined },
      );
    }
    releaseNote =
      typeof tag === "string"
        ? `latest release is tagged ${tag}, which is not semver`
        : "latest release has no tag";
  } else if (releaseStatus !== 404) {
    return { state: "unknown", reason: `GitHub answered ${releaseStatus}`, evidence: [] };
  }

  const tags = await cachedGet(`${base}/tags?per_page=100`, ctx, HEADERS);
  if (tags.kind === "offline-miss") return { state: "unknown", reason: "offline", evidence: [] };
  if (tags.kind === "error") return { state: "unknown", reason: tags.error.message, evidence: [] };
  if (isRateLimited(tags)) {
    state.rateLimited = true;
    return { state: "unknown", reason: "GitHub rate limit reached", evidence: [] };
  }
  const tagsStatus = tags.kind === "stale" ? 200 : tags.status;
  if (tagsStatus === 404)
    return { state: "unknown", reason: "repository not found or private", evidence: [] };
  if (tagsStatus !== 200 || !Array.isArray(tags.body)) {
    return { state: "unknown", reason: `GitHub answered ${tagsStatus}`, evidence: [] };
  }
  const candidates = (tags.body as { name?: unknown }[])
    .map((t) => (typeof t.name === "string" ? { tag: t.name, v: version(t.name) } : undefined))
    .filter(
      (t): t is { tag: string; v: string } => t?.v !== undefined && semver.prerelease(t.v) === null,
    )
    .sort((a, b) => semver.rcompare(a.v, b.v));
  const best = candidates[0];
  if (!best) {
    return {
      state: "unknown",
      reason:
        releaseNote === "no releases"
          ? "no releases and no semver tags"
          : "no semver release and no semver tags",
      evidence: [{ kind: "fact", source: `GET ${base}/releases/latest`, description: releaseNote }],
    };
  }
  return claimFrom(
    best.v,
    [
      { kind: "fact", source: `GET ${base}/releases/latest`, description: releaseNote },
      {
        kind: "fact",
        source: `GET ${base}/tags`,
        description: `highest semver tag is ${best.tag}`,
      },
      ...cacheEvidence(tags),
    ],
    // A tag is not a release: the publisher never declared it stable.
    { cap: "medium" },
  );
}
