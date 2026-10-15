import semver from "semver";
import { claimFrom } from "../../core/confidence.js";
import type { Claim, Diagnostic, Evidence } from "../../core/model.js";
import {
  cachedGet,
  cachedEvidenceText,
  staleEvidenceText,
  type CachedGetResult,
  type NetContext,
} from "../shared/cached-get.js";
import { tagVersion } from "../shared/tag-version.js";
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

/** Stops asking GitHub for the rest of the run and says why (architecture.md §13). */
function rateLimitReached(state: GithubRunState): Claim<string> {
  if (!state.rateLimited) {
    state.rateLimited = true;
    state.diagnostics.push({
      severity: "warning",
      source: "github",
      message: "GitHub rate limit reached; remaining GitHub versions are unknown",
    });
  }
  return { state: "unknown", reason: "GitHub rate limit reached", evidence: [] };
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
        description: cachedEvidenceText(result.fetchedAt),
      },
    ];
  return [];
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

  // A repository without releases answers 404: that answer is cached too, so
  // it is not asked again within the TTL and works offline (F-41).
  const release = await cachedGet(`${base}/releases/latest`, ctx, HEADERS, [404]);
  if (release.kind === "error")
    return { state: "unknown", reason: release.error.message, evidence: [] };
  if (isRateLimited(release)) return rateLimitReached(state);
  // What the releases endpoint said, for the evidence of the tag fallback.
  let releaseNote: Evidence = {
    kind: "fact",
    source: `GET ${base}/releases/latest`,
    description: "no releases",
  };
  if (release.kind === "offline-miss") {
    // Offline with no cached answer: the tags may still be cached.
    releaseNote = {
      kind: "inference",
      source: "cache",
      description: "whether it has releases is unknown: running offline with no cached answer",
    };
  } else if (release.status === 200) {
    const tag = (release.body as { tag_name?: unknown } | undefined)?.tag_name;
    const v = typeof tag === "string" ? tagVersion(tag) : undefined;
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
    releaseNote = {
      ...releaseNote,
      description:
        typeof tag === "string"
          ? `latest release is tagged ${tag}, which is not semver`
          : "latest release has no tag",
    };
  } else if (release.status !== 404) {
    return { state: "unknown", reason: `GitHub answered ${release.status}`, evidence: [] };
  }

  const tags = await cachedGet(`${base}/tags?per_page=100`, ctx, HEADERS);
  if (tags.kind === "offline-miss") return { state: "unknown", reason: "offline", evidence: [] };
  if (tags.kind === "error") return { state: "unknown", reason: tags.error.message, evidence: [] };
  if (isRateLimited(tags)) return rateLimitReached(state);
  const tagsStatus = tags.status;
  if (tagsStatus === 404)
    return { state: "unknown", reason: "repository not found or private", evidence: [] };
  if (tagsStatus !== 200 || !Array.isArray(tags.body)) {
    return { state: "unknown", reason: `GitHub answered ${tagsStatus}`, evidence: [] };
  }
  const candidates = (tags.body as { name?: unknown }[])
    .map((t) => (typeof t.name === "string" ? { tag: t.name, v: tagVersion(t.name) } : undefined))
    .filter(
      (t): t is { tag: string; v: string } => t?.v !== undefined && semver.prerelease(t.v) === null,
    )
    .sort((a, b) => semver.rcompare(a.v, b.v));
  const best = candidates[0];
  if (!best) {
    return {
      state: "unknown",
      reason:
        release.kind === "offline-miss"
          ? "no semver tags, and releases are unknown offline"
          : releaseNote.description === "no releases"
            ? "no releases and no semver tags"
            : "no semver release and no semver tags",
      evidence: [releaseNote],
    };
  }
  return claimFrom(
    best.v,
    [
      releaseNote,
      ...(release.kind === "offline-miss" ? [] : cacheEvidence(release)),
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
