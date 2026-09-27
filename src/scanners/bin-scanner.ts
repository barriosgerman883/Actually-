import { join } from "node:path";
import type { Filesystem } from "../core/ports.js";

export interface Executable {
  name: string;
  dir: string;
  path: string;
  /** Target after following symlinks. */
  realPath: string;
}

/**
 * Lists executables in the user-level directories actually is allowed to
 * look at (docs/architecture.md §3.3). It never walks the whole PATH.
 * The first directory wins when a name appears twice, as in PATH lookup.
 */
export async function listExecutables(fs: Filesystem, dirs: string[]): Promise<Executable[]> {
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
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.kind !== "file" && entry.kind !== "symlink") continue;
      if (names.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (!(await fs.isExecutableFile(path))) continue;
      let realPath: string;
      try {
        realPath = await fs.realpath(path);
      } catch {
        continue;
      }
      names.add(entry.name);
      result.push({ name: entry.name, dir, path, realPath });
    }
  }
  return result;
}
