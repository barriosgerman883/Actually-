#!/usr/bin/env node
// PreToolUse hook for Edit, Write, MultiEdit and NotebookEdit
// (docs/mvp.md §9, "Agentes").
//
// Protects the guardrails themselves and files that must never be edited
// by hand, and rejects edits that weaken the checks: skipped or focused
// tests, type-check suppressions and lint suppressions.
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
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

/** Returns the decision for an edit: deny, ask, or undefined to allow. */
export function evaluate(input, projectDir) {
  const tool = input?.tool_name;
  const toolInput = input?.tool_input ?? {};
  const path = toolInput.file_path ?? toolInput.notebook_path;
  if (typeof path !== "string") return undefined;
  const base = projectDir ?? input?.cwd ?? process.cwd();
  const absolute = isAbsolute(path) ? path : resolve(base, path);
  const rel = relative(base, absolute).split(sep).join("/");
  const inside = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  const target = inside ? rel : absolute;

  for (const [re, why] of DENY_PATHS) {
    if (re.test(target)) return { decision: "deny", reason: `${target}: ${why}` };
  }
  if (CODE_FILE.test(target)) {
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
  for (const [re, why] of ASK_PATHS) {
    if (re.test(target)) return { decision: "ask", reason: `${target}: ${why}` };
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
