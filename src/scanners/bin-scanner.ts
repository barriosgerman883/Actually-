import { extname, join, resolve } from "node:path";
import { DEFAULT_PATHEXT, parseCmdShim } from "../core/cmd-shim.js";
import type { Filesystem } from "../core/ports.js";

export interface Executable {
  /** The command name: on Windows, the file name without its PATHEXT extension. */
  name: string;
  dir: string;
  path: string;
  /** Target after following symlinks, or what a Windows .cmd launcher runs. */
  realPath: string;
  /** realPath comes from reading a .cmd launcher (ADR 0009). */
  viaLauncher: boolean;
}

export interface ScanOptions {
  platform?: string;
  /** Windows only: which extensions make a command, in the order cmd tries them. */
  pathext?: string;
}

/** What a .cmd or .bat launcher runs, if it is one of the known templates. */
async function launcherTarget(fs: Filesystem, path: string): Promise<string | undefined> {
  if (!/\.(cmd|bat)$/i.test(path)) return undefined;
  let target;
  try {
    target = parseCmdShim(await fs.readText(path));
  } catch {
    return undefined;
  }
  if (!target) return undefined;
  const relative = target.kind === "exe" ? target.path : target.script;
  const file = resolve(join(path, ".."), ...relative.split(/[\\/]/));
  // Compared with repositories by their real paths (F-64).
  return fs.realpath(file).catch(() => file);
}

/**
 * Lists executables in the user-level directories actually is allowed to
 * look at (docs/architecture.md §3.3). It never walks the whole PATH.
 * The first directory wins when a name appears twice, as in PATH lookup.
 * On Windows, `foo.cmd` and `foo.ps1` are one command, `foo`, and the
 * extension that comes first in PATHEXT is the one that runs.
 */
export async function listExecutables(
  fs: Filesystem,
  dirs: string[],
  options: ScanOptions = {},
): Promise<Executable[]> {
  const windows = options.platform === "win32";
  const extensions = (options.pathext || DEFAULT_PATHEXT)
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.startsWith("."));
  const commandName = (file: string) =>
    windows && extensions.includes(extname(file).toLowerCase())
      ? file.slice(0, -extname(file).length)
      : file;
  const key = (name: string) => (windows ? name.toLowerCase() : name);
  const rank = (file: string) => (windows ? extensions.indexOf(extname(file).toLowerCase()) : 0);

  const result: Executable[] = [];
  const names = new Set<string>();
  const seenDirs = new Set<string>();
  for (const dir of dirs) {
    let realDir: string;
    try {
      realDir = await fs.realpath(dir);
    } catch {
      continue;
    }
    if (seenDirs.has(realDir)) continue;
    seenDirs.add(realDir);
    let entries;
    try {
      entries = await fs.readDir(dir);
    } catch {
      continue;
    }
    // One candidate per command in this directory: the one cmd would run.
    const candidates = new Map<string, string>();
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.kind !== "file" && entry.kind !== "symlink") continue;
      const name = key(commandName(entry.name));
      if (names.has(name)) continue;
      if (!(await fs.isExecutableFile(join(dir, entry.name)))) continue;
      const current = candidates.get(name);
      if (current === undefined || rank(entry.name) < rank(current)) {
        candidates.set(name, entry.name);
      }
    }
    for (const [name, file] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
      const path = join(dir, file);
      const target = windows ? await launcherTarget(fs, path) : undefined;
      let realPath: string;
      try {
        realPath = target ?? (await fs.realpath(path));
      } catch {
        continue;
      }
      names.add(name);
      result.push({
        name: commandName(file),
        dir,
        path,
        realPath,
        viaLauncher: target !== undefined,
      });
    }
  }
  return result;
}
