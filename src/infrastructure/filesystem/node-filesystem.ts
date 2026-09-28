import { constants } from "node:fs";
import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { DirEntry, Filesystem } from "../../core/ports.js";

/**
 * Largest file read as text. The biggest files actually reads are the
 * lockfiles of large monorepos, a few megabytes; anything past this is not
 * a file it should load into memory (F-46).
 */
export const MAX_TEXT_BYTES = 64 * 1024 * 1024;

/** Read-only filesystem. Nothing in this module writes to disk. */
export function nodeFilesystem(): Filesystem {
  return {
    async exists(path) {
      try {
        await access(path);
        return true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") return false;
        throw error;
      }
    },
    async readText(path) {
      // A FIFO or a device would block forever, and a huge file would
      // exhaust memory; neither is a file actually needs (F-46).
      const info = await stat(path);
      if (!info.isFile()) throw new Error(`${path} is not a regular file`);
      if (info.size > MAX_TEXT_BYTES) throw new Error(`${path} is too large to read`);
      return readFile(path, "utf8");
    },
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
