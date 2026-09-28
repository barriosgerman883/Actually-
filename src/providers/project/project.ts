import { dirname, join, relative, sep } from "node:path";
import semver from "semver";
import { parse as parseYaml } from "yaml";
import type { Diagnostic, Evidence } from "../../core/model.js";
import type { Filesystem } from "../../core/ports.js";

export type DependencySection = "dependencies" | "devDependencies" | "optionalDependencies";

export interface ProjectDependency {
  name: string;
  requested: string;
  section: DependencySection;
  resolved?: { version: string; evidence: Evidence };
  resolvedUnknownReason?: string;
  installed?: { version: string; evidence: Evidence; path: string };
}

export interface ProjectScan {
  root: string;
  manifestPath?: string;
  packageManager?: { value: string; evidence: Evidence[] };
  dependencies: ProjectDependency[];
  /** .npmrc files to apply, in order: the workspace root's, then the project's. */
  npmrcs: { path: string; text: string }[];
  /** Set when a registry setting could apply but cannot be read or interpreted. */
  registryUnknown?: string;
  diagnostics: Diagnostic[];
}

const SECTIONS: DependencySection[] = ["dependencies", "devDependencies", "optionalDependencies"];

async function readJson(
  fs: Filesystem,
  path: string,
): Promise<Record<string, unknown> | undefined> {
  const parsed: unknown = JSON.parse(await fs.readText(path));
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
}

/**
 * Finds the nearest directory with a package.json, walking up from `start`
 * but never above `stopAt` (the home directory).
 */
export async function findProjectRoot(
  fs: Filesystem,
  start: string,
  stopAt: string,
): Promise<string | undefined> {
  let dir = start;
  for (;;) {
    if (await fs.exists(join(dir, "package.json"))) return dir;
    if (dir === stopAt) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function findUp(
  fs: Filesystem,
  start: string,
  file: string,
  stopAt: string,
): Promise<string | undefined> {
  let dir = start;
  for (;;) {
    const candidate = join(dir, file);
    if (await fs.exists(candidate)) return candidate;
    if (dir === stopAt) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function stripPeerSuffix(version: string): string {
  const i = version.indexOf("(");
  return i >= 0 ? version.slice(0, i) : version;
}

type LockVersions = Map<string, string>;

/**
 * Versions pinned for one importer. Undefined when the lockfile does not
 * describe that importer: a lockfile without `importers` describes only
 * its own directory.
 */
function pnpmLockVersions(text: string, importer: string): LockVersions | undefined {
  const doc = parseYaml(text) as Record<string, unknown> | null;
  const out: LockVersions = new Map();
  if (!doc || typeof doc !== "object") return importer === "." ? out : undefined;
  const importers = doc.importers as Record<string, Record<string, unknown>> | undefined;
  const scope = importers ? importers[importer] : importer === "." ? doc : undefined;
  if (!scope) return importers && importer === "." ? out : undefined;
  for (const section of SECTIONS) {
    const entries = scope[section] as Record<string, unknown> | undefined;
    if (!entries) continue;
    for (const [name, value] of Object.entries(entries)) {
      const raw =
        typeof value === "string"
          ? value
          : typeof value === "object" &&
              value !== null &&
              typeof (value as { version?: unknown }).version === "string"
            ? (value as { version: string }).version
            : undefined;
      if (raw) out.set(name, stripPeerSuffix(raw));
    }
  }
  return out;
}

function npmLockVersions(text: string): LockVersions {
  const doc = JSON.parse(text) as Record<string, unknown>;
  const out: LockVersions = new Map();
  const packages = doc.packages as Record<string, { version?: unknown }> | undefined;
  if (packages) {
    for (const [key, value] of Object.entries(packages)) {
      if (!key.startsWith("node_modules/") || key.lastIndexOf("node_modules/") !== 0) continue;
      if (typeof value.version === "string")
        out.set(key.slice("node_modules/".length), value.version);
    }
    return out;
  }
  const dependencies = doc.dependencies as Record<string, { version?: unknown }> | undefined;
  for (const [name, value] of Object.entries(dependencies ?? {})) {
    if (typeof value.version === "string") out.set(name, value.version);
  }
  return out;
}

/**
 * Reads a project's declared, resolved and installed dependency versions
 * from files only (docs/providers/pnpm.md). Nothing is executed inside the
 * project: its .npmrc or packageManager field could run code.
 */
export async function scanProject(
  fs: Filesystem,
  root: string,
  stopAt: string,
): Promise<ProjectScan> {
  const scan: ProjectScan = { root, dependencies: [], npmrcs: [], diagnostics: [] };
  const manifestPath = join(root, "package.json");
  if (!(await fs.exists(manifestPath))) return scan;
  scan.manifestPath = manifestPath;

  let manifest: Record<string, unknown> | undefined;
  try {
    manifest = await readJson(fs, manifestPath);
  } catch {
    scan.diagnostics.push({
      severity: "warning",
      source: "project",
      message: `${manifestPath} could not be parsed`,
    });
    return scan;
  }
  if (!manifest) return scan;

  if (typeof manifest.packageManager === "string") {
    const pm = manifest.packageManager.split("@")[0];
    if (pm) {
      scan.packageManager = {
        value: pm,
        evidence: [
          {
            kind: "fact",
            source: manifestPath,
            description: `packageManager is "${manifest.packageManager}"`,
          },
        ],
      };
    }
  }

  for (const section of SECTIONS) {
    const entries = manifest[section];
    if (typeof entries !== "object" || entries === null) continue;
    for (const [name, spec] of Object.entries(entries as Record<string, unknown>)) {
      if (typeof spec !== "string") continue;
      if (scan.dependencies.some((d) => d.name === name)) continue;
      scan.dependencies.push({ name, requested: spec, section });
    }
  }

  // Lockfile: this project's own lockfiles first. A pnpm-lock.yaml above it
  // counts only when it lists this project among its importers.
  let lockVersions: LockVersions | undefined;
  let lockSource: string | undefined;
  let lockUnsupported: string | undefined;
  const ownPnpmLock = join(root, "pnpm-lock.yaml");
  const npmLock = (await fs.exists(join(root, "package-lock.json")))
    ? join(root, "package-lock.json")
    : undefined;
  try {
    let pnpmLock: string | undefined;
    let pnpmVersions: LockVersions | undefined;
    if (await fs.exists(ownPnpmLock)) {
      pnpmLock = ownPnpmLock;
      pnpmVersions = pnpmLockVersions(await fs.readText(ownPnpmLock), ".");
    } else if (!npmLock && root !== stopAt) {
      const above = await findUp(fs, dirname(root), "pnpm-lock.yaml", stopAt);
      if (above) {
        const importer = relative(dirname(above), root).split(sep).join("/");
        pnpmVersions = pnpmLockVersions(await fs.readText(above), importer);
        if (pnpmVersions) pnpmLock = above;
      }
    }
    if (pnpmLock) {
      lockVersions = pnpmVersions;
      lockSource = pnpmLock;
      if (!scan.packageManager) {
        scan.packageManager = {
          value: "pnpm",
          evidence: [
            { kind: "inference", source: pnpmLock, description: "pnpm-lock.yaml is present" },
          ],
        };
      }
    } else if (npmLock) {
      lockVersions = npmLockVersions(await fs.readText(npmLock));
      lockSource = npmLock;
      if (!scan.packageManager) {
        scan.packageManager = {
          value: "npm",
          evidence: [
            { kind: "inference", source: npmLock, description: "package-lock.json is present" },
          ],
        };
      }
    } else {
      for (const [file, pm] of [
        ["yarn.lock", "yarn"],
        ["bun.lock", "bun"],
        ["bun.lockb", "bun"],
      ] as const) {
        if (await fs.exists(join(root, file))) {
          lockUnsupported = `${file} is not supported yet`;
          if (!scan.packageManager) {
            scan.packageManager = {
              value: pm,
              evidence: [
                { kind: "inference", source: join(root, file), description: `${file} is present` },
              ],
            };
          }
          break;
        }
      }
    }
  } catch {
    scan.diagnostics.push({
      severity: "warning",
      source: "project",
      message: `lockfile in ${root} could not be parsed`,
    });
    lockVersions = undefined;
  }

  for (const dep of scan.dependencies) {
    const locked = lockVersions?.get(dep.name);
    if (locked && semver.valid(locked) && lockSource) {
      dep.resolved = {
        version: locked,
        evidence: { kind: "fact", source: lockSource, description: `pins ${dep.name}@${locked}` },
      };
    } else if (locked) {
      dep.resolvedUnknownReason = `lockfile entry "${locked}" is not a registry version`;
    } else {
      dep.resolvedUnknownReason =
        lockUnsupported ?? (lockSource ? "not found in the lockfile" : "no lockfile");
    }
    const installedManifest = join(root, "node_modules", dep.name, "package.json");
    try {
      const pkg = await readJson(fs, installedManifest);
      if (pkg && typeof pkg.version === "string" && semver.valid(pkg.version)) {
        dep.installed = {
          version: pkg.version,
          path: dirname(installedManifest),
          evidence: {
            kind: "fact",
            source: installedManifest,
            description: `version is ${pkg.version}`,
          },
        };
      }
    } catch {
      // Not installed: the claim stays unknown.
    }
  }

  // pnpm applies the workspace root's .npmrc, then the project's. When in
  // doubt about which registry applies, nothing is queried (architecture.md §8).
  const workspaceFile = await findUp(fs, root, "pnpm-workspace.yaml", stopAt);
  const workspaceRoot = workspaceFile ? dirname(workspaceFile) : undefined;
  const npmrcDirs = [root];
  if (workspaceRoot && workspaceRoot !== root) {
    for (let dir = dirname(root); dir !== workspaceRoot; dir = dirname(dir)) {
      const between = join(dir, ".npmrc");
      if (await fs.exists(between)) {
        scan.registryUnknown ??= `${between} is between the project and its workspace root`;
      }
      if (dirname(dir) === dir) break;
    }
    npmrcDirs.unshift(workspaceRoot);
  }
  for (const dir of npmrcDirs) {
    const npmrcPath = join(dir, ".npmrc");
    if (!(await fs.exists(npmrcPath))) continue;
    try {
      scan.npmrcs.push({ path: npmrcPath, text: await fs.readText(npmrcPath) });
    } catch {
      scan.registryUnknown ??= `${npmrcPath} could not be read`;
      scan.diagnostics.push({
        severity: "warning",
        source: "project",
        message: `${npmrcPath} could not be read`,
      });
    }
  }
  return scan;
}
