/**
 * What a Windows `.cmd` launcher runs, read from its text instead of running
 * it. Node.js does not start a `.cmd` without a shell (CVE-2024-27980), and
 * actually never uses one (docs/architecture.md §7, ADR 0009).
 *
 * Only the launchers that cmd-shim (pnpm, Corepack) and npm generate are
 * recognized, and only whole: every line must match the template. Anything
 * else returns undefined, and the caller does not run it.
 *
 * Paths are returned as written, relative to the launcher's directory.
 */
/**
 * The extensions that make a file a command on Windows when PATHEXT is not
 * set, with .PS1 for PowerShell (docs/architecture.md §3.3, F-56).
 */
export const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD;.PS1";

export type CmdShimTarget =
  /** An executable to run directly. */
  | { kind: "exe"; path: string }
  /** A script to run with the node.exe beside the launcher, or else node from PATH. */
  | { kind: "node"; script: string };

/** A path after `%~dp0\` or `%dp0%\`: no quotes, variables, shell operators or drive. */
const PATH = String.raw`([^"%&|<>^:\n]+)`;
/** A value that is set but not used, such as NODE_PATH. */
const ANY = String.raw`[^"%\n]*`;

type Part = string | { optional: string[] };

function line(text: string): string {
  return text
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace("\\{P\\}", PATH)
    .replace("\\{ANY\\}", ANY);
}

function template(parts: Part[]): RegExp {
  const body = parts
    .map((p) =>
      typeof p === "string"
        ? `${line(p)}\\n`
        : `(?:${p.optional.map((l) => `${line(l)}\\n`).join("")})?`,
    )
    .join("");
  return new RegExp(`^${body}$`, "i");
}

/** pnpm adds it to the launchers of global packages; it does not change what runs. */
const NODE_PATH: Part = {
  optional: [
    "@IF NOT DEFINED NODE_PATH (",
    '@SET "NODE_PATH={ANY}"',
    ") ELSE (",
    '@SET "NODE_PATH={ANY};%NODE_PATH%"',
    ")",
  ],
};
const PATHEXT: Part = { optional: ["@SET PATHEXT=%PATHEXT:;.JS;=;%"] };
const NPM_PROLOGUE = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
];

const TEMPLATES: { kind: CmdShimTarget["kind"]; re: RegExp }[] = [
  // cmd-shim, as in pnpm's own standalone launcher.
  { kind: "exe", re: template(["@SETLOCAL", '@"%~dp0\\{P}" %*']) },
  // cmd-shim with node, as in Corepack and pnpm's global packages.
  {
    kind: "node",
    re: template([
      "@SETLOCAL",
      NODE_PATH,
      '@IF EXIST "%~dp0\\node.exe" (',
      '"%~dp0\\node.exe" "%~dp0\\{P}" %*',
      ") ELSE (",
      PATHEXT,
      'node "%~dp0\\{P}" %*',
      ")",
    ]),
  },
  // npm's cmd-shim.
  { kind: "exe", re: template([...NPM_PROLOGUE, '"%dp0%\\{P}" %*']) },
  {
    kind: "node",
    re: template([
      ...NPM_PROLOGUE,
      'IF EXIST "%dp0%\\node.exe" (',
      'SET "_prog=%dp0%\\node.exe"',
      ") ELSE (",
      'SET "_prog=node"',
      "SET PATHEXT=%PATHEXT:;.JS;=;%",
      ")",
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%" "%dp0%\\{P}" %*',
    ]),
  },
];

/** A relative path that stays a path: no empty segment, so no root or UNC prefix. */
function relativePath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[\\/]/).every((segment) => segment.trim() !== "") ? path : undefined;
}

export function parseCmdShim(text: string): CmdShimTarget | undefined {
  const normalized = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/[ \t]+/g, " "))
    .filter((l) => l !== "")
    .map((l) => `${l}\n`)
    .join("");
  for (const { kind, re } of TEMPLATES) {
    const match = re.exec(normalized);
    if (!match) continue;
    const [, first, second] = match;
    const path = relativePath(first);
    if (!path) return undefined;
    if (kind === "exe") return /\.exe$/i.test(path) ? { kind, path } : undefined;
    // Both branches of a node launcher must run the same script.
    if (second !== undefined && second !== first) return undefined;
    return { kind, script: path };
  }
  return undefined;
}
