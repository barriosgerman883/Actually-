import type { Filesystem } from "../../core/ports.js";

/**
 * A JSON file whose top level is an object, or undefined for any other JSON.
 * Read and parse errors are thrown, so the caller decides what they mean.
 */
export async function readJsonObject(
  fs: Filesystem,
  path: string,
): Promise<Record<string, unknown> | undefined> {
  const parsed: unknown = JSON.parse(await fs.readText(path));
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

/** The same, with a file that is missing, unreadable or not JSON as undefined. */
export async function readJsonObjectIfAny(
  fs: Filesystem,
  path: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    return await readJsonObject(fs, path);
  } catch {
    return undefined;
  }
}
