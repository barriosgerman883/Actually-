import { constants } from "node:fs";
import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { DirEntry, Filesystem } from "../../core/ports.js";

/** Read-only filesystem. Nothing in this module writes to disk. */
export function nodeFilesystem(): Filesystem {
  return {
    async exists(path) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    readText: (path) => readFile(path, "utf8"),
    async readDir(path) {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((e): DirEntry => ({
        name: e.name,
        kind: e.isSymbolicLink()
          ? "symlink"
          : e.isDirectory()
            ? "directory"
            : e.isFile()
              ? "file"
              : "other",
      }));
    },
    realpath: (path) => realpath(path),
    async isDirectory(path) {
      try {
        return (await stat(path)).isDirectory();
      } catch {
        return false;
      }
    },
    async isExecutableFile(path) {
      try {
        const info = await stat(path);
        if (!info.isFile()) return false;
        if (process.platform === "win32") return true;
        await access(path, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}
