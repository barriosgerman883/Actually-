import type { Claim, Diagnostic, Inventory, ProjectSummary, ToolRecord } from "../../core/model.js";

const SCHEMA_VERSION = 1;

/**
 * JSON projection of the domain model (docs/design.md §14). Claims are never
 * omitted and `null` never stands for missing information. Evidence is
 * included only for `explain`.
 */
function claimJson<T>(claim: Claim<T>, withEvidence: boolean): Record<string, unknown> {
  switch (claim.state) {
    case "known":
      return {
        state: "known",
        value: claim.value,
        confidence: claim.confidence,
        ...(withEvidence ? { evidence: claim.evidence } : {}),
      };
    case "unknown":
      return {
        state: "unknown",
        reason: claim.reason,
        ...(withEvidence ? { evidence: claim.evidence } : {}),
      };
    case "not-applicable":
      return { state: "not-applicable" };
  }
}

export function toolJson(tool: ToolRecord, withEvidence: boolean): Record<string, unknown> {
  return {
    id: tool.id,
    name: tool.name,
    scope: tool.scope,
    ...(tool.projectRoot !== undefined ? { projectRoot: tool.projectRoot } : {}),
    status: tool.status,
    ...(tool.updateType !== undefined ? { updateType: tool.updateType } : {}),
    ...(tool.mayBreak !== undefined ? { mayBreak: tool.mayBreak } : {}),
    confidence: tool.confidence,
    versions: {
      requested: claimJson(tool.versions.requested, withEvidence),
      resolved: claimJson(tool.versions.resolved, withEvidence),
      installed: claimJson(tool.versions.installed, withEvidence),
      latest: claimJson(tool.versions.latest, withEvidence),
    },
    installation: claimJson(tool.installation, withEvidence),
    source: claimJson(tool.source, withEvidence),
    update: claimJson(tool.update, withEvidence),
  };
}

function projectJson(project: ProjectSummary): Record<string, unknown> {
  return {
    root: project.root,
    packageManager: claimJson(project.packageManager, false),
    repository: claimJson(project.repository, false),
    dependenciesChecked: project.dependenciesChecked,
    updatesAvailable: project.updatesAvailable,
  };
}

export function documentJson(input: {
  tools: ToolRecord[];
  projects?: ProjectSummary[];
  diagnostics: Diagnostic[];
  withEvidence: boolean;
}): string {
  const doc: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    tools: input.tools.map((t) => toolJson(t, input.withEvidence)),
  };
  if (input.projects) doc.projects = input.projects.map(projectJson);
  doc.diagnostics = input.diagnostics;
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function inventoryJson(inventory: Inventory): string {
  return documentJson({ ...inventory, withEvidence: false });
}
