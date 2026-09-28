#!/usr/bin/env node
// PreToolUse hook for Edit, Write, MultiEdit and NotebookEdit
// (docs/mvp.md §9, "Agentes").
//
// Protects the guardrails themselves and files that must never be edited
// by hand, and rejects edits that weaken the checks: skipped or focused
// tests, type-check suppressions and lint suppressions.
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PREFIX = "actually guardrail (docs/mvp.md §9)";

const DENY_PATHS = [
  [/^\.claude(\/|$)/, "only the user changes the agent guardrails"],
  [/^(CLAUDE|AGENTS)\.md$/, "only the user changes the rules for agents"],
  [/(^|\/)pnpm-lock\.yaml$/, "the lockfile is regenerated with pnpm install, never edited by hand"],
  [/(^|\/)\.git(\/|$)/, "files inside .git are managed by git"],
  [
    /^docs\/review\/2026-09-cross-review\.md$/,
    "the cross-review is a snapshot of the original documents and is not updated (CLAUDE.md)",
  ],
];
const ASK_PATHS = [
  [/^\.github\/workflows\//, "CI workflows decide what blocks a merge"],
  [
    /^(vitest\.config\.ts|eslint\.config\.js|\.prettierignore)$/,
    "this file decides what the checks cover",
  ],
];

// The user's own Claude Code settings and hooks, relative to the home directory (F-21).
const HOME_DENY = /^\.claude\/(settings(\.local)?\.json|hooks(\/|$))/;
// Parts of a file that hold the rules; an edit that changes them asks (F-22).
const RULE_SECTIONS = [
  ["docs/mvp.md", "### Agentes", "the rules for agents"],
  ["docs/review/findings.md", "## Cómo se usa", "the findings protocol"],
];
const PACKAGE_RULES = ["scripts", "simple-git-hooks"];

const CODE_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
// Built from parts so this file does not trip the checks it implements.
const WEAKENERS = [
  [
    new RegExp(
      "\\b(it|test|describe|suite|bench)(\\.each\\([^)]*\\))?\\.(" +
        ["sk", "ip|on", "ly|to", "do"].join("") +
        ")\\b",
    ),
    "skipped, focused or placeholder tests",
  ],
  [new RegExp("\\b(xit|xdescribe|fit|fdescribe)\\s*\\("), "skipped or focused tests"],
  [new RegExp("@ts-" + "(ignore|nocheck)"), "type-check suppressions"],
  [new RegExp("eslint-" + "disable"), "lint suppressions"],
];

function count(re, text) {
  return (String(text ?? "").match(new RegExp(re.source, "g")) ?? []).length;
}

/** Pairs of [before, after] text that the edit changes. */
function changes(tool, input, absolute) {
  if (tool === "Edit") return [[input.old_string, input.new_string]];
  if (tool === "MultiEdit") return (input.edits ?? []).map((e) => [e.old_string, e.new_string]);
  if (tool === "NotebookEdit") return [["", input.new_source]];
  if (tool === "Write") {
    let before;
    try {
      before = readFileSync(absolute, "utf8");
    } catch {
      before = "";
    }
    return [[before, input.content]];
  }
  return [];
}

/**
 * The path with symlinks resolved. A file that does not exist yet gets the
 * resolved path of its nearest existing parent (F-21).
 */
function realPath(path) {
  const rest = [];
  for (let dir = path; ; dir = dirname(dir)) {
    try {
      return join(realpathSync(dir), ...rest);
    } catch {
      if (dirname(dir) === dir) return path;
      rest.unshift(basename(dir));
    }
  }
}

/** `path` relative to `base` with forward slashes, or undefined if it is outside. */
function inside(base, path) {
  const rel = relative(base, path).split(sep).join("/");
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? rel : undefined;
}

/** The text of a file after the edit, or undefined if the edit has an unknown shape. */
function editedText(tool, input, before) {
  if (tool === "Write") return typeof input.content === "string" ? input.content : undefined;
  const edits = tool === "Edit" ? [input] : tool === "MultiEdit" ? input.edits : undefined;
  if (!Array.isArray(edits)) return undefined;
  let text = before;
  for (const e of edits) {
    if (typeof e?.old_string !== "string" || typeof e?.new_string !== "string") return undefined;
    text = e.replace_all
      ? text.split(e.old_string).join(e.new_string)
      : text.replace(e.old_string, () => e.new_string);
  }
  return text;
}

/** The lines of a Markdown section, up to the next heading of the same or a higher level. */
function section(text, heading) {
  const level = heading.indexOf(" ");
  const lines = [];
  let open = false;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    const depth = fenced ? 0 : (/^(#+) /.exec(line)?.[1].length ?? 0);
    if (open && depth > 0 && depth <= level) break;
    if (!open && !fenced && line.trimEnd() === heading) open = true;
    if (open) lines.push(line);
  }
  return lines.join("\n");
}

/** Why an edit to a file that holds rules needs confirmation, if it changes them (F-22). */
function changesRules(target, tool, input, absolute) {
  const rules = RULE_SECTIONS.find(([file]) => file === target);
  if (target !== "package.json" && !rules) return undefined;
  let before;
  try {
    before = readFileSync(absolute, "utf8");
  } catch {
    before = "";
  }
  const after = editedText(tool, input, before);
  if (after === undefined) return "the edit could not be checked";
  if (rules) {
    const [, heading, what] = rules;
    return section(before, heading) === section(after, heading)
      ? undefined
      : `the edit changes "${heading.replace(/^#+ /, "")}", ${what}`;
  }
  const fields = (text) => {
    try {
      const json = JSON.parse(text);
      return JSON.stringify(PACKAGE_RULES.map((key) => json?.[key]));
    } catch {
      return undefined;
    }
  };
  const was = fields(before);
  const will = fields(after);
  if (was === undefined || will === undefined) return "the edit leaves package.json unparseable";
  return was === will
    ? undefined
    : "the edit changes scripts or simple-git-hooks, which run the checks";
}

/** Returns the decision for an edit: deny, ask, or undefined to allow. */
export function evaluate(input, projectDir, home = homedir()) {
  const tool = input?.tool_name;
  const toolInput = input?.tool_input ?? {};
  const path = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof path !== "string") return undefined;
  const base = projectDir ?? input?.cwd ?? process.cwd();
  const absolute = isAbsolute(path) ? path : resolve(base, path);
  const real = realPath(absolute);
  // The path as written and the path it resolves to must both be allowed (F-21).
  const targets = [
    ...new Set([inside(base, absolute) ?? absolute, inside(realPath(base), real) ?? real]),
  ];

  for (const homeDir of new Set([home, realPath(home)])) {
    for (const p of [absolute, real]) {
      const rel = inside(homeDir, p);
      if (rel !== undefined && HOME_DENY.test(rel))
        return {
          decision: "deny",
          reason: `~/${rel}: only the user changes their Claude Code settings and hooks`,
        };
    }
  }
  for (const target of targets) {
    for (const [re, why] of DENY_PATHS) {
      if (re.test(target)) return { decision: "deny", reason: `${target}: ${why}` };
    }
  }
  for (const target of targets) {
    if (!CODE_FILE.test(target)) continue;
    for (const [before, after] of changes(tool, toolInput, absolute)) {
      for (const [re, what] of WEAKENERS) {
        if (count(re, after) > count(re, before)) {
          return {
            decision: "deny",
            reason: `${target}: the edit adds ${what}; fix the cause or record a finding instead`,
          };
        }
      }
    }
  }
  for (const target of targets) {
    for (const [re, why] of ASK_PATHS) {
      if (re.test(target)) return { decision: "ask", reason: `${target}: ${why}` };
    }
    const why = changesRules(target, tool, toolInput, absolute);
    if (why) return { decision: "ask", reason: `${target}: ${why}` };
  }
  return undefined;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  const result = evaluate(input, process.env.CLAUDE_PROJECT_DIR);
  if (!result) return;
  const reason =
    result.decision === "deny"
      ? `${PREFIX}: blocked: ${result.reason}. Do not work around this: tell the user what you needed and why.`
      : `${PREFIX}: ${result.reason}. Confirm only if this is intended.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.decision,
        permissionDecisionReason: reason,
      },
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
