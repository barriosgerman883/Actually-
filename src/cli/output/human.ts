import type { Claim, Diagnostic, Inventory, ProjectSummary, ToolRecord } from "../../core/model.js";
import { sanitizeDeep } from "./sanitize.js";
import { STATUS_TEXT, symbolFor, type Style } from "./style.js";

export interface HumanOptions {
  home: string;
  verbose: boolean;
  style: Style;
}

function tildify(path: string, home: string): string {
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function field(label: string, value: string): string {
  return `  ${label.padEnd(12)} ${value}`;
}

function claimValue(claim: Claim<string>, withReason: boolean): string {
  if (claim.state === "known") return claim.value;
  if (claim.state === "not-applicable") return "not applicable";
  return withReason ? `unknown (${claim.reason})` : "unknown";
}

function headline(tool: ToolRecord, style: Style): string {
  let text = `${symbolFor(tool.status, style)} ${style.bold(tool.name)}  ${STATUS_TEXT[tool.status]}`;
  if (tool.status === "outdated" && tool.updateType) {
    text += ` (${tool.updateType}${tool.mayBreak ? ", may break" : ""})`;
  }
  return text;
}

function toolBlock(tool: ToolRecord, opts: HumanOptions): string {
  const lines = [headline(tool, opts.style)];
  const v = tool.versions;
  if (v.requested.state !== "not-applicable")
    lines.push(field("requested", claimValue(v.requested, false)));
  if (v.resolved.state !== "not-applicable")
    lines.push(field("resolved", claimValue(v.resolved, false)));
  if (tool.scope === "global" || v.installed.state === "known" || v.resolved.state !== "known") {
    lines.push(field("installed", claimValue(v.installed, false)));
  }
  lines.push(field("latest", claimValue(v.latest, tool.status !== "current")));
  if (tool.status !== "current") {
    if (tool.installation.state === "known")
      lines.push(`  installed by ${tool.installation.value.provider}`);
    else if (tool.scope === "global") lines.push(field("provider", "unknown"));
    if (hasKnownClaim(tool)) lines.push(field("confidence", tool.confidence));
  }
  return lines.join("\n");
}

/** Executables no provider manages: nothing about them is known. */
function hasKnownClaim(tool: ToolRecord): boolean {
  const v = tool.versions;
  return [v.installed, v.resolved, v.latest, tool.installation].some((c) => c.state === "known");
}

function isUnknownExecutable(tool: ToolRecord): boolean {
  return (
    tool.scope === "global" &&
    tool.installation.state === "unknown" &&
    tool.versions.installed.state === "unknown" &&
    tool.versions.latest.state === "unknown"
  );
}

function projectHeader(project: ProjectSummary, opts: HumanOptions): string {
  const lines = [opts.style.bold(`PROJECT · ${tildify(project.root, opts.home)}`)];
  if (project.packageManager.state !== "not-applicable") {
    lines.push(
      field(
        "manager",
        project.packageManager.state === "known" ? project.packageManager.value : "unknown",
      ),
    );
  }
  if (project.repository.state === "known") {
    lines.push(
      field("repository", project.repository.value.url ?? project.repository.value.identifier),
    );
  }
  lines.push(
    field(
      "dependencies",
      `${project.dependenciesChecked} checked · ${project.updatesAvailable} ${project.updatesAvailable === 1 ? "update" : "updates"} available`,
    ),
  );
  return lines.join("\n");
}

export function summaryLine(tools: ToolRecord[]): string {
  const outdated = tools.filter((t) => t.status === "outdated");
  const breaking = outdated.filter((t) => t.mayBreak).length;
  const unknown = tools.filter((t) => t.status === "unknown").length;
  const other = tools.filter((t) => t.status === "warning" || t.status === "error").length;
  const parts = [`${outdated.length} ${outdated.length === 1 ? "update" : "updates"} available`];
  if (breaking > 0) parts.push(`${breaking} may include breaking changes`);
  if (unknown > 0) parts.push(`${unknown} unknown`);
  if (other > 0) parts.push(`${other} to check`);
  return parts.join(" · ");
}

/** `actually status` (docs/design.md §5). Short by default, --verbose for all. */
export function renderStatus(untrusted: Inventory, opts: HumanOptions): string {
  const inventory = sanitizeDeep(untrusted);
  const out: string[] = [opts.style.bold("actually")];
  const globals = inventory.tools.filter((t) => t.scope === "global");
  if (globals.length > 0 || inventory.projects.length === 0) {
    out.push("", opts.style.bold("GLOBAL"));
    const unknownExes = opts.verbose ? [] : globals.filter(isUnknownExecutable);
    for (const tool of globals) {
      if (unknownExes.includes(tool)) continue;
      out.push("", toolBlock(tool, opts));
    }
    if (unknownExes.length > 0) {
      out.push(
        "",
        `${symbolFor("unknown", opts.style)} ${unknownExes.length} ${unknownExes.length === 1 ? "executable" : "executables"} with no known provider`,
        `  ${unknownExes.map((t) => t.name).join(", ")}`,
        opts.style.dim("  use --verbose to list them one by one"),
      );
    }
    if (globals.length === 0) out.push("", opts.style.dim("  no global tools found"));
  }
  for (const project of inventory.projects) {
    out.push("", projectHeader(project, opts));
    const deps = inventory.tools.filter(
      (t) => t.scope === "project" && t.projectRoot === project.root,
    );
    const shown = opts.verbose ? deps : deps.filter((t) => t.status !== "current");
    for (const tool of shown) out.push("", toolBlock(tool, opts));
    const hidden = deps.length - shown.length;
    if (hidden > 0)
      out.push(
        "",
        opts.style.dim(
          `  ${hidden} ${hidden === 1 ? "dependency" : "dependencies"} up to date (--verbose to list)`,
        ),
      );
  }
  out.push("", summaryLine(inventory.tools));
  if (inventory.tools.length > 0)
    out.push(opts.style.dim("Run `actually explain <tool>` to see the evidence."));
  return `${out.join("\n")}\n`;
}

function detailValue(claim: Claim<unknown>, format: (v: never) => string): string {
  if (claim.state === "known") return format(claim.value as never);
  if (claim.state === "not-applicable") return "not applicable";
  return `unknown (${claim.reason})`;
}

/** `actually status <tool>` (docs/design.md §8). */
export function renderToolDetail(untrusted: ToolRecord, opts: HumanOptions): string {
  const tool = sanitizeDeep(untrusted);
  const blocks: [string, string][] = [];
  const v = tool.versions;
  if (v.requested.state !== "not-applicable")
    blocks.push(["Requested", detailValue(v.requested, (x: string) => x)]);
  if (v.resolved.state !== "not-applicable")
    blocks.push(["Resolved", detailValue(v.resolved, (x: string) => x)]);
  blocks.push(["Installed", detailValue(v.installed, (x: string) => x)]);
  blocks.push(["Latest (source-declared)", detailValue(v.latest, (x: string) => x)]);
  blocks.push([
    "Scope",
    tool.projectRoot ? `project · ${tildify(tool.projectRoot, opts.home)}` : tool.scope,
  ]);
  blocks.push([
    "Installation provider",
    detailValue(tool.installation, (x: { provider: string }) => x.provider),
  ]);
  blocks.push([
    "Source",
    detailValue(tool.source, (x: { identifier: string; url?: string }) => x.url ?? x.identifier),
  ]);
  let status: string = STATUS_TEXT[tool.status];
  if (tool.updateType)
    status += ` (${tool.updateType}${tool.mayBreak ? ", may include breaking changes" : ""})`;
  blocks.push(["Status", status]);
  blocks.push(["Id", tool.id]);
  const body = blocks.map(([label, value]) => `${opts.style.bold(label)}\n${value}`).join("\n\n");
  return `${opts.style.bold(tool.name)}\n\n${body}\n`;
}

const EXPLAIN_ORDER: [string, (t: ToolRecord) => Claim<unknown>, (v: never) => string][] = [
  ["Requested", (t) => t.versions.requested, (v: string) => v],
  ["Resolved", (t) => t.versions.resolved, (v: string) => v],
  ["Installed version", (t) => t.versions.installed, (v: string) => v],
  ["Installed by", (t) => t.installation, (v: { provider: string }) => v.provider],
  [
    "Source",
    (t) => t.source,
    (v: { identifier: string; url?: string }) => (v.url ?? v.identifier).replace(/^https:\/\//, ""),
  ],
  ["Latest", (t) => t.versions.latest, (v: string) => v],
  ["Updates through", (t) => t.update, (v: { provider: string }) => v.provider],
];

/** `actually explain <tool>` (docs/design.md §9): facts, inferences, unknowns. */
export function renderExplain(untrusted: ToolRecord, opts: HumanOptions): string {
  const tool = sanitizeDeep(untrusted);
  const out = [opts.style.bold(tool.name), opts.style.dim(tool.id), ""];
  const notDetermined: string[] = [];
  const notApplicable: string[] = [];
  for (const [label, get, format] of EXPLAIN_ORDER) {
    const claim = get(tool);
    if (claim.state === "not-applicable") {
      notApplicable.push(label.toLowerCase());
      continue;
    }
    if (claim.state === "unknown") {
      notDetermined.push(`  ${label.toLowerCase().padEnd(20)} ${claim.reason}`);
      for (const e of claim.evidence) {
        notDetermined.push(
          `    ${e.kind.padEnd(10)} ${tildify(e.source, opts.home)}: ${e.description}`,
        );
      }
      continue;
    }
    out.push(
      `${opts.style.bold(label.padEnd(20))} ${format(claim.value as never).padEnd(30)} ${claim.confidence}`,
    );
    for (const e of claim.evidence) {
      out.push(`  ${e.kind.padEnd(10)} ${tildify(e.source, opts.home)}: ${e.description}`);
    }
    out.push("");
  }
  if (notDetermined.length > 0) out.push(opts.style.bold("Not determined"), ...notDetermined, "");
  if (notApplicable.length > 0)
    out.push(opts.style.bold("Not applicable"), `  ${notApplicable.join(", ")}`, "");
  let status: string = `${STATUS_TEXT[tool.status]}`;
  if (tool.updateType)
    status += ` (${tool.updateType}${tool.mayBreak ? ", may include breaking changes" : ""})`;
  out.push(`${opts.style.bold("Status".padEnd(20))} ${status.padEnd(30)} ${tool.confidence}`);
  return `${out.join("\n")}\n`;
}

/** Diagnostics go to stderr in plain language (docs/design.md §10). */
export function renderDiagnostics(untrusted: Diagnostic[], home: string): string {
  const diagnostics = sanitizeDeep(untrusted);
  if (diagnostics.length === 0) return "";
  const lines = diagnostics.map((d) => `${d.severity}: ${d.source}: ${tildify(d.message, home)}`);
  return `${lines.join("\n")}\nactually continued with the other sources.\n`;
}
