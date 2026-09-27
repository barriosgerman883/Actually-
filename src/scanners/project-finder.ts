import { join } from "node:path";
import type { Filesystem } from "../core/ports.js";

/**
 * Finds project roots under the configured scan paths (docs/mvp.md §6).
 * A directory with a package.json or a .git entry is a project, and the
 * search does not descend into it. Hidden directories, node_modules and
 * symlinks are skipped, and depth is bounded, so the scan never walks the
 * whole disk (RNF-003).
 */
export async function findProjects(
  fs: Filesystem,
  roots: string[],
  maxDepth: number,
): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();

  async function visit(dir: string, depth: number): Promise<void> {
    let real: string;
    try {
      real = await fs.realpath(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);

    if ((await fs.exists(join(dir, "package.json"))) || (await fs.exists(join(dir, ".git")))) {
      found.push(dir);
      return;
    }
    if (depth >= maxDepth) return;
    let entries;
    try {
      entries = await fs.readDir(dir);
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.kind !== "directory") continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      await visit(join(dir, entry.name), depth + 1);
    }
  }

  for (const root of roots) await visit(root, 0);
  return found;
}
