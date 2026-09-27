import type { Claim, ConfidenceLevel, Evidence } from "./model.js";

const order: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

export function minConfidence(levels: ConfidenceLevel[]): ConfidenceLevel | undefined {
  if (levels.length === 0) return undefined;
  return levels.reduce((a, b) => (order[a] <= order[b] ? a : b));
}

export function capConfidence(level: ConfidenceLevel, cap: ConfidenceLevel): ConfidenceLevel {
  return order[level] <= order[cap] ? level : cap;
}

/**
 * Applies the MVP confidence rules (docs/architecture.md §6):
 *
 * - high: at least one fact states the value and nothing contradicts it;
 * - medium: only inferences, at least two independent and concordant;
 * - low: a single inference, or contradictory evidence.
 *
 * Returns undefined when there is no evidence at all, so the caller can
 * produce an `unknown` claim instead of inventing a value.
 */
export function confidenceFor(
  evidence: Evidence[],
  options: { contradicted?: boolean } = {},
): ConfidenceLevel | undefined {
  if (evidence.length === 0) return undefined;
  if (options.contradicted) return "low";
  if (evidence.some((e) => e.kind === "fact")) return "high";
  const inferences = new Set(evidence.map((e) => e.source)).size;
  return inferences >= 2 ? "medium" : "low";
}

/**
 * Builds a claim from a value and the evidence that supports it. Without
 * evidence the result is `unknown`: a value nobody can support is never
 * reported as known.
 */
export function claimFrom<T>(
  value: T,
  evidence: Evidence[],
  options: { contradicted?: boolean; cap?: ConfidenceLevel; reasonIfUnsupported?: string } = {},
): Claim<T> {
  const level = confidenceFor(evidence, options);
  if (level === undefined) {
    return {
      state: "unknown",
      reason: options.reasonIfUnsupported ?? "no evidence supports a value",
      evidence,
    };
  }
  return {
    state: "known",
    value,
    confidence: options.cap ? capConfidence(level, options.cap) : level,
    evidence,
  };
}
