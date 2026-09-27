import { mkdir, mkdtemp, readdir, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Local state that is not a network response, such as the first-run
 * notice marker (docs/architecture.md §3.5). Separate from the cache, so it
 * exists even when there is no cache. Writes only inside its directory.
 */
export interface LocalState {
  hasMarker(name: string): Promise<boolean>;
  /** Returns false when the marker could not be written. */
  writeMarker(name: string): Promise<boolean>;
  /** An empty directory used as the working directory for pnpm (§7). */
  neutralDir(): Promise<string>;
}

export function fileLocalState(dir: string): LocalState {
  let neutral: Promise<string> | undefined;

  async function createNeutral(): Promise<string> {
    const path = join(dir, "empty");
    try {
      await mkdir(path, { recursive: true });
      if ((await readdir(path)).length === 0) return path;
    } catch {
      // Fall through to a fresh temporary directory.
    }
    return mkdtemp(join(tmpdir(), "actually-"));
  }

  return {
    async hasMarker(name) {
      try {
        await access(join(dir, name));
        return true;
      } catch {
        return false;
      }
    },
    async writeMarker(name) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, name), "", "utf8");
        return true;
      } catch {
        return false;
      }
    },
    neutralDir() {
      neutral ??= createNeutral();
      return neutral;
    },
  };
}
