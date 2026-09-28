import { dirname, join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DirEntry, Filesystem } from "../../core/ports.js";

/** Directories visited at most when a workspace pattern is unbounded. */
const MAX_DIRECTORIES = 10_000;

const SKIPPED = new Set(["node_modules", ".git"]);

export type WorkspaceScan =
  | {
      state: "known";
      root: string;
      /** Package name → the package.json that declares it. */
      packages: Map<string, string>;
    }
  | { state: "unknown"; root: string; reason: string };

export type WorkspaceCache = Map<string, Promise<WorkspaceScan>>;

type Marker = { patterns: string[] } | { error: string } | undefined;

function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : undefined;
}

/** Workspace patterns declared in a directory, by pnpm-workspace.yaml or package.json. */
async function markerAt(fs: Filesystem, dir: string): Promise<Marker> {
  let found = false;
  const patterns: string[] = [];
  const yamlPath = join(dir, "pnpm-workspace.yaml");
  const manifestPath = join(dir, "package.json");
  let hasYaml: boolean;
  let hasManifest: boolean;
  try {
    hasYaml = await fs.exists(yamlPath);
    hasManifest = await fs.exists(manifestPath);
  } catch {
    // A marker that cannot be checked could declare siblings (F-46).
    return { error: `${dir} could not be read` };
  }
  if (hasYaml) {
    found = true;
    let doc: unknown;
    try {
      doc = parseYaml(await fs.readText(yamlPath));
    } catch {
      return { error: `${yamlPath} could not be parsed` };
    }
    const list = stringList(
      typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>).packages : [],
    );
    if (!list) return { error: `${yamlPath} could not be interpreted` };
    patterns.push(...list);
  }
  if (hasManifest) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(await fs.readText(manifestPath));
    } catch {
      return { error: `${manifestPath} could not be parsed` };
    }
    const field =
      typeof manifest === "object" && manifest !== null && !Array.isArray(manifest)
        ? (manifest as Record<string, unknown>).workspaces
        : undefined;
    if (field !== undefined) {
      found = true;
      const list = stringList(
        Array.isArray(field)
          ? field
          : typeof field === "object" && field !== null
            ? (field as Record<string, unknown>).packages
            : field,
      );
      if (!list)
        return { error: `the workspaces field of ${manifestPath} could not be interpreted` };
      patterns.push(...list);
    }
  }
  return found ? { patterns } : undefined;
}

/**
 * How many directories below its workspace root a pattern can match.
 * Infinity when the depth is not bounded; undefined when the pattern can
 * reach outside the root.
 */
function patternDepth(pattern: string): number | undefined {
  if (pattern.startsWith("!")) return 0; // Negations only remove packages.
  if (pattern.startsWith("/") || pattern.includes("\\")) return undefined;
  const segments = pattern.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.includes("..")) return undefined;
  if (pattern.includes("**") || pattern.includes("{")) return Infinity;
  return segments.length;
}

/**
 * Collects the name of every package.json down to `maxDepth` below `root`.
 * It is a superset of the workspace's packages whatever glob syntax the
 * package manager supports, so no member is ever missed.
 */
async function collectPackages(
  fs: Filesystem,
  root: string,
  maxDepth: number,
  maxDirectories: number,
): Promise<WorkspaceScan> {
  const unknown = (reason: string): WorkspaceScan => ({ state: "unknown", root, reason });
  const packages = new Map<string, string>();
  const queue = [{ dir: root, depth: 0 }];
  let visited = 0;
  for (let next = queue.pop(); next; next = queue.pop()) {
    visited += 1;
    if (visited > maxDirectories) {
      return unknown(`${root} has too many directories to find all its workspace packages`);
    }
    let entries: DirEntry[];
    try {
      entries = await fs.readDir(next.dir);
    } catch {
      return unknown(`${next.dir} could not be read`);
    }
    for (const entry of entries) {
      const path = join(next.dir, entry.name);
      if (entry.kind === "file" && entry.name === "package.json") {
        let name: unknown;
        try {
          const manifest: unknown = JSON.parse(await fs.readText(path));
          name =
            typeof manifest === "object" && manifest !== null
              ? (manifest as Record<string, unknown>).name
              : undefined;
        } catch {
          return unknown(`${path} could not be parsed`);
        }
        if (typeof name === "string" && !packages.has(name)) packages.set(name, path);
        continue;
      }
      if (next.depth >= maxDepth || SKIPPED.has(entry.name)) continue;
      if (entry.kind === "directory") {
        queue.push({ dir: path, depth: next.depth + 1 });
      } else if (entry.kind === "symlink") {
        const target = await fs.realpath(path).catch(() => undefined);
        if (target !== undefined && (await fs.isDirectory(target))) {
          return unknown(`${path} links to a directory, which is not followed`);
        }
      }
    }
  }
  return { state: "known", root, packages };
}

/**
 * Finds the workspace a project belongs to, if any, and the names of all its
 * packages (docs/architecture.md §8). The root is the outermost directory,
 * from `start` up to `stopAt`, with a pnpm-workspace.yaml or a package.json
 * with `workspaces`: that also covers nested workspaces. Only files are read.
 */
export async function findWorkspace(
  fs: Filesystem,
  start: string,
  stopAt: string,
  cache: WorkspaceCache = new Map(),
  maxDirectories = MAX_DIRECTORIES,
): Promise<WorkspaceScan | undefined> {
  const markers: { dir: string; patterns: string[] }[] = [];
  for (let dir = start; ; dir = dirname(dir)) {
    const marker = await markerAt(fs, dir);
    if (marker && "error" in marker) return { state: "unknown", root: dir, reason: marker.error };
    if (marker) markers.push({ dir, ...marker });
    if (dir === stopAt || dirname(dir) === dir) break;
  }
  const root = markers.at(-1)?.dir;
  if (root === undefined) return undefined;

  let maxDepth = 0;
  for (const marker of markers) {
    const offset = relative(root, marker.dir).split(sep).filter(Boolean).length;
    for (const pattern of marker.patterns) {
      const depth = patternDepth(pattern);
      if (depth === undefined) {
        return {
          state: "unknown",
          root,
          reason: `workspace pattern "${pattern}" in ${marker.dir} is not supported`,
        };
      }
      maxDepth = Math.max(maxDepth, offset + depth);
    }
  }
  const key = `${root}\0${maxDepth}`;
  let scan = cache.get(key);
  if (!scan) {
    scan = collectPackages(fs, root, maxDepth, maxDirectories);
    cache.set(key, scan);
  }
  return scan;
}
