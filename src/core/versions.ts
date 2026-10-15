import semver from "semver";
import { minConfidence } from "./confidence.js";
import type { Claim, ConfidenceLevel, ToolStatus, UpdateType, VersionClaims } from "./model.js";

export interface StatusResult {
  status: ToolStatus;
  updateType?: UpdateType;
  mayBreak?: boolean;
}

/**
 * The most concrete local version known: installed if available,
 * otherwise resolved (docs/architecture.md §5).
 */
export function localVersion(versions: VersionClaims): Claim<string> {
  if (versions.installed.state === "known") return versions.installed;
  if (versions.resolved.state === "known") return versions.resolved;
  if (versions.installed.state === "unknown") return versions.installed;
  if (versions.resolved.state === "unknown") return versions.resolved;
  return versions.installed;
}

/** Which number changed. Purely numeric: 0.2.0 → 0.3.0 is "minor". */
export function updateTypeOf(from: string, to: string): UpdateType | undefined {
  const a = semver.parse(from);
  const b = semver.parse(to);
  if (!a || !b) return undefined;
  if (a.major !== b.major) return "major";
  if (a.minor !== b.minor) return "minor";
  if (a.patch !== b.patch) return "patch";
  return undefined;
}

/**
 * Whether semver allows the update to break compatibility. Same rule as
 * npm's caret range: the latest version is outside `^from`.
 * This is a convention-based estimate, not a check of the actual change.
 */
export function mayBreak(from: string, to: string): boolean {
  const a = semver.parse(from);
  const b = semver.parse(to);
  if (!a || !b) return true;
  if (a.major !== b.major) return true;
  if (a.major === 0 && a.minor !== b.minor) return true;
  if (a.major === 0 && a.minor === 0 && a.patch !== b.patch) return true;
  return false;
}

/** Derives status from versions (docs/architecture.md §5). */
export function deriveStatus(versions: VersionClaims, failed = false): StatusResult {
  if (failed) return { status: "error" };
  const local = localVersion(versions);
  const latest = versions.latest;
  if (local.state !== "known" || latest.state !== "known") return { status: "unknown" };
  const a = semver.valid(local.value);
  const b = semver.valid(latest.value);
  if (!a || !b) return { status: "warning" };
  const cmp = semver.compare(a, b);
  if (cmp === 0) return { status: "current" };
  if (cmp > 0) return { status: "warning" };
  return { status: "outdated", updateType: updateTypeOf(a, b), mayBreak: mayBreak(a, b) };
}

/** Summary confidence: minimum of local version, latest and installation (§6). */
export function summaryConfidence(claims: Claim<unknown>[]): ConfidenceLevel {
  const levels = claims.flatMap((c) => (c.state === "known" ? [c.confidence] : []));
  return minConfidence(levels) ?? "low";
}
