import { join } from "node:path";
import { commandFileNames, pathDirs } from "../core/command-path.js";
import type { Filesystem } from "../core/ports.js";
import { launcherTarget, type Executable } from "./bin-scanner.js";

export interface LookupOptions {
  path?: string;
  pathext?: string;
  platform: string;
}

/**
 * Finds each named command where the shell would: the first match in PATH
 * (docs/architecture.md §3.3, ADR 0011). It asks for files by name only and
 * never lists a PATH directory, so the thousands of other programs there
 * are never inventoried. Nothing found is run.
 */
export async function findCommands(
  fs: Filesystem,
  names: readonly string[],
  options: LookupOptions,
): Promise<Executable[]> {
  const windows = options.platform === "win32";
  const dirs = pathDirs(options.path, options.platform);
  const found: Executable[] = [];
  for (const name of names) {
    search: for (const dir of dirs) {
      for (const file of commandFileNames(name, options.platform, options.pathext)) {
        const path = join(dir, file);
        if (!(await fs.isExecutableFile(path).catch(() => false))) continue;
        const target = windows ? await launcherTarget(fs, path) : undefined;
        const realPath = target ?? (await fs.realpath(path).catch(() => path));
        found.push({ name, dir, path, realPath, viaLauncher: target !== undefined });
        break search;
      }
    }
  }
  return found;
}
