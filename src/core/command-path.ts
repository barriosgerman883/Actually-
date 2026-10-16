/**
 * Where a shell would look for a command, worked out without running
 * anything (docs/architecture.md §3.3, ADR 0009, ADR 0011). The caller
 * checks the candidates through the filesystem port.
 */

/** What cmd tries when PATHEXT is not set; cmd never runs a .ps1. */
export const CMD_PATHEXT = ".COM;.EXE;.BAT;.CMD";

/**
 * The absolute directories of PATH, in order and without repeats. Never the
 * current directory or a path relative to it: on Windows only drive and UNC
 * paths, elsewhere only paths that start with `/`.
 */
export function pathDirs(path: string | undefined, platform: string): string[] {
  const windows = platform === "win32";
  const dirs: string[] = [];
  for (const entry of (path ?? "").split(windows ? ";" : ":")) {
    const dir = entry.trim().replace(/^"(.*)"$/, "$1");
    const absolute = windows
      ? /^[a-z]:[\\/]/i.test(dir) || /^\\\\[^\\]+\\[^\\]+/.test(dir)
      : dir.startsWith("/");
    if (absolute && !dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

/**
 * The file names a command can have in one directory, in the order the
 * shell tries them: on Windows the name with each PATHEXT extension, as cmd
 * does; elsewhere the name itself.
 */
export function commandFileNames(name: string, platform: string, pathext?: string): string[] {
  if (platform !== "win32") return [name];
  return (pathext || CMD_PATHEXT)
    .split(";")
    .map((e) => e.trim())
    .filter((e) => e.startsWith("."))
    .map((e) => name + e);
}
