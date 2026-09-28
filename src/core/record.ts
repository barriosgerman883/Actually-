import type {
  Claim,
  Installation,
  ToolRecord,
  ToolScope,
  ToolSource,
  UpdateStrategy,
  VersionClaims,
} from "./model.js";
import { deriveStatus, localVersion, summaryConfidence } from "./versions.js";

/**
 * Opaque, deterministic id (docs/architecture.md §5):
 *   global:<provider>:<name>        ("unknown" provider when not known)
 *   global:<provider>:<location>    (a tool identified by where it is, such
 *                                    as a Git repository: two can share a name)
 *   project:<absolute root>:<name>
 */
export function makeToolId(input: {
  scope: ToolScope;
  name: string;
  provider?: string;
  projectRoot?: string;
  location?: string;
}): string {
  if (input.scope === "project") return `project:${input.projectRoot ?? "unknown"}:${input.name}`;
  return `global:${input.provider ?? "unknown"}:${input.location ?? input.name}`;
}

export interface RecordInput {
  name: string;
  scope: ToolScope;
  projectRoot?: string;
  /** Absolute path that identifies a global tool instead of its name (F-37). */
  location?: string;
  versions: VersionClaims;
  installation: Claim<Installation>;
  source: Claim<ToolSource>;
  update: Claim<UpdateStrategy>;
  failed?: boolean;
}

/** Builds a ToolRecord, deriving id, status and summary confidence. */
export function buildRecord(input: RecordInput): ToolRecord {
  const provider =
    input.installation.state === "known" ? input.installation.value.provider : undefined;
  const status = deriveStatus(input.versions, input.failed);
  const record: ToolRecord = {
    id: makeToolId({
      scope: input.scope,
      name: input.name,
      provider,
      projectRoot: input.projectRoot,
      location: input.location,
    }),
    name: input.name,
    scope: input.scope,
    ...(input.scope === "project" ? { projectRoot: input.projectRoot } : {}),
    versions: input.versions,
    installation: input.installation,
    source: input.source,
    update: input.update,
    status: status.status,
    confidence: summaryConfidence([
      localVersion(input.versions),
      input.versions.latest,
      input.installation,
    ]),
  };
  if (status.status === "outdated") {
    if (status.updateType) record.updateType = status.updateType;
    record.mayBreak = status.mayBreak ?? true;
  }
  return record;
}
