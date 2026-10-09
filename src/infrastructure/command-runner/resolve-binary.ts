import { win32 } from "node:path";
import { parseCmdShim } from "../../core/cmd-shim.js";
import type { Filesystem } from "../../core/ports.js";

/** What cmd tries when PATHEXT is not set. */
const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

export type ResolvedBinary =
  | { ok: true; file: string; args: string[] }
  | { ok: false; reason: "not-found" | "failed"; message: string };

export interface ResolveOptions {
  fs: Filesystem;
  /** The PATH and PATHEXT the command would run with. */
  path?: string;
  pathext?: string;
}

/** Drive and UNC paths only: never the current directory or a path relative to it. */
function searchDir(entry: string): string | undefined {
  const dir = entry.trim().replace(/^"(.*)"$/, "$1");
  return /^[a-z]:[\\/]/i.test(dir) || /^\\\\[^\\]+\\[^\\]+/.test(dir) ? dir : undefined;
}

/** The first `name` + extension in PATH, in PATHEXT order, as cmd finds it. */
async function findInPath(name: string, options: ResolveOptions): Promise<string | undefined> {
  const extensions = (options.pathext || DEFAULT_PATHEXT)
    .split(";")
    .map((e) => e.trim())
    .filter((e) => e.startsWith("."));
  for (const entry of (options.path ?? "").split(";")) {
    const dir = searchDir(entry);
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = win32.join(dir, name + ext);
      if (await isFile(options.fs, candidate)) return candidate;
    }
  }
  return undefined;
}

async function isFile(fs: Filesystem, path: string): Promise<boolean> {
  try {
    return (await fs.exists(path)) && !(await fs.isDirectory(path));
  } catch {
    return false;
  }
}

const notFound = (name: string): ResolvedBinary => ({
  ok: false,
  reason: "not-found",
  message: `${name} is not installed or not in PATH`,
});

const cannotRun = (launcher: string): ResolvedBinary => ({
  ok: false,
  reason: "failed",
  message: `${launcher} is a launcher actually cannot run without a shell`,
});

/** An .exe or .com runs directly; any other match is not run. */
async function executable(name: string, options: ResolveOptions): Promise<ResolvedBinary> {
  const found = await findInPath(name, options);
  if (!found) return notFound(name);
  return /\.(exe|com)$/i.test(found) ? { ok: true, file: found, args: [] } : cannotRun(found);
}

/**
 * Finds a command on Windows without a shell (docs/architecture.md §7, ADR
 * 0009). An .exe runs directly. A .cmd or .bat launcher is read, never run:
 * if it is one that cmd-shim or npm writes, what it would start runs
 * instead, with the same arguments. Anything else is not run.
 */
export async function resolveWindowsCommand(
  name: string,
  options: ResolveOptions,
): Promise<ResolvedBinary> {
  const found = await findInPath(name, options);
  if (!found) return notFound(name);
  const ext = win32.extname(found).toLowerCase();
  if (ext === ".exe" || ext === ".com") return { ok: true, file: found, args: [] };
  if (ext !== ".cmd" && ext !== ".bat") return cannotRun(found);

  let text: string;
  try {
    text = await options.fs.readText(found);
  } catch (error) {
    return {
      ok: false,
      reason: "failed",
      message: `${found} could not be read: ${(error as Error).message}`,
    };
  }
  const target = parseCmdShim(text);
  if (!target) return cannotRun(found);

  const dir = win32.dirname(found);
  const file = win32.resolve(dir, target.kind === "exe" ? target.path : target.script);
  if (!(await isFile(options.fs, file))) {
    return { ok: false, reason: "failed", message: `${found} runs ${file}, which does not exist` };
  }
  if (target.kind === "exe") return { ok: true, file, args: [] };

  // As the launcher does: node.exe beside it, or else node from PATH.
  const beside = win32.join(dir, "node.exe");
  const node = (await isFile(options.fs, beside))
    ? ({ ok: true, file: beside, args: [] } as const)
    : await executable("node", options);
  return node.ok ? { ok: true, file: node.file, args: [file] } : node;
}
