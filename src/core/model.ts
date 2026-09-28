/**
 * Domain model. This is the code form of docs/architecture.md §5 and must
 * stay in sync with it. The JSON contract (docs/design.md §14) is a
 * projection of these types.
 */

export type ToolScope = "global" | "project";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface Evidence {
  /** `fact`: an authoritative source states it. `inference`: it is deduced. */
  kind: "fact" | "inference";
  /** What was consulted: a command, a file or an endpoint. */
  source: string;
  description: string;
}

/**
 * A statement about a value with an explicit state. An optional field
 * cannot tell "I don't know" from "does not apply"; a Claim can.
 */
export type Claim<T> =
  | { state: "known"; value: T; confidence: ConfidenceLevel; evidence: Evidence[] }
  | { state: "unknown"; reason: string; evidence: Evidence[] }
  | { state: "not-applicable" };

export interface VersionClaims {
  /** Declared range, for example "^5.9.0" in package.json. */
  requested: Claim<string>;
  /** Version pinned in the lockfile. */
  resolved: Claim<string>;
  /** Version present on disk. */
  installed: Claim<string>;
  /** Version the source declares as the latest stable (architecture.md §5). */
  latest: Claim<string>;
}

export type UpdateType = "major" | "minor" | "patch";

export type ToolStatus = "current" | "outdated" | "unknown" | "warning" | "error";

export interface Installation {
  provider: string;
  path?: string;
}

export interface ToolSource {
  provider: string;
  identifier: string;
  url?: string;
}

/** Informational only: actually never runs updates. */
export interface UpdateStrategy {
  provider: string;
}

export interface ToolRecord {
  /**
   * Opaque, deterministic identifier. Consumers must not parse it.
   * It changes when the scope, location or detected provider changes.
   */
  id: string;
  name: string;
  scope: ToolScope;
  /** Present only when scope is "project". */
  projectRoot?: string;

  versions: VersionClaims;
  installation: Claim<Installation>;
  source: Claim<ToolSource>;
  update: Claim<UpdateStrategy>;

  status: ToolStatus;
  /** Present only when status is "outdated". */
  updateType?: UpdateType;
  /** Present only when status is "outdated". */
  mayBreak?: boolean;
  /** Summary of the claims that determine status (architecture.md §6). */
  confidence: ConfidenceLevel;
}

export interface Diagnostic {
  severity: "warning" | "error";
  /** Provider or component that emitted it, for example "github". */
  source: string;
  message: string;
  /** Affected tool, if any. */
  toolId?: string;
}

export interface ProjectSummary {
  root: string;
  packageManager: Claim<string>;
  repository: Claim<ToolSource>;
  dependenciesChecked: number;
  updatesAvailable: number;
}

export interface Inventory {
  tools: ToolRecord[];
  projects: ProjectSummary[];
  diagnostics: Diagnostic[];
}

export const notApplicable = { state: "not-applicable" } as const;
