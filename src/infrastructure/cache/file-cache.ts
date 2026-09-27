import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CacheEntry, ResponseCache } from "../../core/ports.js";

/**
 * Cache of network responses (docs/architecture.md §14). It only ever
 * writes inside its own directory (RA-010) and stores public metadata:
 * never tokens, local paths or inventory results. Deleting the directory
 * is always safe.
 */
export function fileCache(dir: string): ResponseCache {
  const fileFor = (key: string) =>
    join(dir, `${createHash("sha256").update(key).digest("hex")}.json`);

  return {
    async get(key) {
      try {
        const parsed = JSON.parse(await readFile(fileFor(key), "utf8")) as Partial<CacheEntry> & {
          key?: string;
        };
        if (parsed.key !== key || typeof parsed.fetchedAt !== "number") return undefined;
        return {
          fetchedAt: parsed.fetchedAt,
          etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
          lastModified: typeof parsed.lastModified === "string" ? parsed.lastModified : undefined,
          body: parsed.body,
        };
      } catch {
        return undefined;
      }
    },
    async set(key, entry) {
      try {
        await mkdir(dir, { recursive: true });
        const target = fileFor(key);
        const temp = `${target}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify({ key, ...entry }), "utf8");
        await rename(temp, target);
      } catch {
        // A cache that cannot be written is not an error: results stay correct.
      }
    },
  };
}

/** Used for --no-cache and [cache] enabled = false. */
export function disabledCache(): ResponseCache {
  return {
    get: async () => undefined,
    set: async () => {},
  };
}
