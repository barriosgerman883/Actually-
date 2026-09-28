import { dirname, join, relative, sep } from "node:path";
import semver from "semver";
import { parse as parseYaml } from "yaml";
import type { Diagnostic, Evidence } from "../../core/model.js";
import type { Filesystem } from "../../core/ports.js";
import type { RegistryFile } from "../npm-registry/registry-config.js";
import { findWorkspace, type WorkspaceCache } from "./workspace.js";

export type DependencySection = "dependencies" | "devDependencies" | "optionalDependencies";

export interface ProjectDependency {
  name: string;
  requested: string;
  section: DependencySection;
  resolved?: { version: string; evidence: Evidence };
  resolvedUnknownReason?: string;
  /** Tarball the lockfile resolves it from, whose host is checked (architecture.md §8). */
  tarball?: { url: string; source: string };
  /** Set when the workspace or the lockfile resolves it locally: it is never queried. */
  local?: { reason: string; evidence: Evidence };
  installed?: { version: string; evidence: Evidence; path: string };
}

export interface ProjectScan {
  root: string;
  manifestPath?: string;
  packageManager?: { value: string; evidence: Evidence[] };
  dependencies: ProjectDependency[];
  /** Every registry file that could apply, from the outermost directory to the project. */
  registryFiles: RegistryFile[];
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
 * The nearest directory that has any of `entries`, walking up from `start`
 * but never above `stopAt` (the home directory).
 */
export async function findUpDir(
  fs: Filesystem,
  start: string,
  entries: string[],
  stopAt: string,
): Promise<string | undefined> {
  let dir = start;
  for (;;) {
    for (const entry of entries) if (await fs.exists(join(dir, entry))) return dir;
    if (dir === stopAt) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * The project root for `start`: the nearest directory with a package.json
 * or a .git, whichever comes first (mvp.md §6, F-40).
 */
export function findProjectRoot(
  fs: Filesystem,
  start: string,
  stopAt: string,
): Promise<string | undefined> {
  return findUpDir(fs, start, ["package.json", ".git"], stopAt);
}

/** Directories from `start` up to `end`, both included; only `start` if `end` is not above it. */
function dirsUpTo(start: string, end: string): string[] {
  const dirs = [start];
  for (let dir = start; dir !== end;) {
    const parent = dirname(dir);
    if (parent === dir) return [start];
    dirs.push(parent);
    dir = parent;
  }
  return dirs;
}

/**
 * The version without its peer suffix: `1.2.3(react@18.0.0)` since lockfile
 * v6, and `1.2.3_react@18.0.0` in v5, the lockfile of pnpm 7 (F-47).
 */
function stripPeerSuffix(version: string, v5: boolean): string {
  const i = v5 ? version.search(/[(_]/) : version.indexOf("(");
  return i >= 0 ? version.slice(0, i) : version;
}

/**
 * What a lockfile resolves a dependency to. Only `registry` may be queried:
 * `local` is a link, a directory or a file, and `other` anything else, such
 * as a git or tarball URL (architecture.md §8).
 */
type LockEntry =
  | { kind: "registry"; version: string; tarball?: string }
  | { kind: "local"; label: string }
  | { kind: "other" };

type LockEntries = Map<string, LockEntry>;

const LOCAL_PREFIXES = ["link:", "file:", "workspace:"];

function pnpmEntry(raw: string, v5: boolean): LockEntry {
  const value = stripPeerSuffix(raw, v5);
  if (semver.valid(value)) return { kind: "registry", version: value };
  const prefix = LOCAL_PREFIXES.find((p) => value.startsWith(p));
  return prefix ? { kind: "local", label: prefix } : { kind: "other" };
}

/** An entry of package-lock.json v2/v3 `packages`, or of v1 `dependencies`. */
function npmEntry(value: unknown): LockEntry {
  if (typeof value !== "object" || value === null) return { kind: "other" };
  const entry = value as { version?: unknown; resolved?: unknown; link?: unknown };
  const version = typeof entry.version === "string" ? entry.version : undefined;
  const resolved = typeof entry.resolved === "string" ? entry.resolved : undefined;
  if (entry.link === true) return { kind: "local", label: "link" };
  if (resolved?.startsWith("file:") || version?.startsWith("file:")) {
    return { kind: "local", label: "file:" };
  }
  if (version && semver.valid(version)) {
    if (resolved === undefined) return { kind: "registry", version };
    if (/^https?:\/\//i.test(resolved)) return { kind: "registry", version, tarball: resolved };
  }
  return { kind: "other" };
}

/**
 * Entries pinned for one importer. Undefined when the lockfile does not
 * describe that importer: a lockfile without `importers` describes only
 * its own directory.
 */
function pnpmLockEntries(text: string, importer: string): LockEntries | undefined {
  const doc = parseYaml(text) as Record<string, unknown> | null;
  const out: LockEntries = new Map();
  if (!doc || typeof doc !== "object") return importer === "." ? out : undefined;
  const v5 = /^5(\.|$)/.test(String(doc.lockfileVersion ?? ""));
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
      if (raw) out.set(name, pnpmEntry(raw, v5));
    }
  }
  return out;
}

/**
 * Entries for one project of a package-lock.json. `member` is the project's
 * path relative to the lockfile, "" for the lockfile's own directory.
 * Undefined when the lockfile does not describe that project.
 */
function npmLockEntries(text: string, member: string): LockEntries | undefined {
  const doc = JSON.parse(text) as Record<string, unknown>;
  const out: LockEntries = new Map();
  const packages = doc.packages as Record<string, unknown> | undefined;
  if (packages) {
    if (member !== "" && !(member in packages)) return undefined;
    // Hoisted entries first; the member's own node_modules overrides them.
    const prefixes =
      member === "" ? ["node_modules/"] : ["node_modules/", `${member}/node_modules/`];
    for (const prefix of prefixes) {
      for (const [key, value] of Object.entries(packages)) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        if (!name.includes("node_modules/")) out.set(name, npmEntry(value));
      }
    }
    return out;
  }
  if (member !== "") return undefined;
  const dependencies = doc.dependencies as Record<string, unknown> | undefined;
  for (const [name, value] of Object.entries(dependencies ?? {})) out.set(name, npmEntry(value));
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
  workspaces: WorkspaceCache = new Map(),
): Promise<ProjectScan> {
  const scan: ProjectScan = { root, dependencies: [], registryFiles: [], diagnostics: [] };
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
      // npm lets optionalDependencies replace the same entry in dependencies (F-33).
      const earlier = scan.dependencies.findIndex((d) => d.name === name);
      if (earlier >= 0 && section !== "optionalDependencies") continue;
      if (earlier >= 0) scan.dependencies.splice(earlier, 1);
      scan.dependencies.push({ name, requested: spec, section });
    }
  }

  // A package of the same workspace is never queried, whatever its spec: a
  // semver range can resolve to it (architecture.md §8).
  const workspace = await findWorkspace(fs, root, stopAt, workspaces);
  if (workspace?.state === "unknown") scan.registryUnknown ??= workspace.reason;
  if (workspace?.state === "known") {
    for (const dep of scan.dependencies) {
      const declaredIn = workspace.packages.get(dep.name);
      if (!declaredIn) continue;
      dep.local = {
        reason: "a package of the same workspace",
        evidence: {
          kind: "fact",
          source: declaredIn,
          description: `${dep.name} is a package of the workspace at ${workspace.root}`,
        },
      };
    }
  }

  // Lockfile: this project's own lockfiles first. A lockfile above it counts
  // only when it lists this project: a pnpm-lock.yaml among its importers, or
  // the package-lock.json of its workspace root among its packages.
  let lockEntries: LockEntries | undefined;
  let lockSource: string | undefined;
  let lockUnsupported: string | undefined;
  const inferManager = (value: string, source: string, file: string) => {
    scan.packageManager ??= {
      value,
      evidence: [{ kind: "inference", source, description: `${file} is present` }],
    };
  };
  const ownPnpmLock = join(root, "pnpm-lock.yaml");
  const npmLock = (await fs.exists(join(root, "package-lock.json")))
    ? join(root, "package-lock.json")
    : undefined;
  try {
    let pnpmLock: string | undefined;
    let pnpmEntries: LockEntries | undefined;
    if (await fs.exists(ownPnpmLock)) {
      pnpmLock = ownPnpmLock;
      pnpmEntries = pnpmLockEntries(await fs.readText(ownPnpmLock), ".");
    } else if (!npmLock && root !== stopAt) {
      const aboveDir = await findUpDir(fs, dirname(root), ["pnpm-lock.yaml"], stopAt);
      const above = aboveDir && join(aboveDir, "pnpm-lock.yaml");
      if (above) {
        const importer = relative(dirname(above), root).split(sep).join("/");
        pnpmEntries = pnpmLockEntries(await fs.readText(above), importer);
        if (pnpmEntries) pnpmLock = above;
      }
    }
    let rootNpmLock: string | undefined;
    let rootEntries: LockEntries | undefined;
    if (!pnpmLock && !npmLock && workspace && workspace.root !== root) {
      const candidate = join(workspace.root, "package-lock.json");
      if (await fs.exists(candidate)) {
        const member = relative(workspace.root, root).split(sep).join("/");
        rootEntries = npmLockEntries(await fs.readText(candidate), member);
        if (rootEntries) rootNpmLock = candidate;
      }
    }
    if (pnpmLock) {
      lockEntries = pnpmEntries;
      lockSource = pnpmLock;
      inferManager("pnpm", pnpmLock, "pnpm-lock.yaml");
    } else if (npmLock) {
      lockEntries = npmLockEntries(await fs.readText(npmLock), "");
      lockSource = npmLock;
      inferManager("npm", npmLock, "package-lock.json");
    } else if (rootNpmLock) {
      lockEntries = rootEntries;
      lockSource = rootNpmLock;
      inferManager("npm", rootNpmLock, "package-lock.json");
    } else {
      for (const [file, pm] of [
        ["yarn.lock", "yarn"],
        ["bun.lock", "bun"],
        ["bun.lockb", "bun"],
      ] as const) {
        if (await fs.exists(join(root, file))) {
          lockUnsupported = `${file} is not supported yet`;
          inferManager(pm, join(root, file), file);
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
    lockEntries = undefined;
  }

  // Installed: looked up like Node does, from the project up to its workspace root.
  const nodeModulesDirs = workspace ? dirsUpTo(root, workspace.root) : [root];
  for (const dep of scan.dependencies) {
    const entry = lockEntries?.get(dep.name);
    if (entry?.kind === "registry" && lockSource) {
      dep.resolved = {
        version: entry.version,
        evidence: {
          kind: "fact",
          source: lockSource,
          description: `pins ${dep.name}@${entry.version}`,
        },
      };
      if (entry.tarball) dep.tarball = { url: entry.tarball, source: lockSource };
    } else if (entry && lockSource) {
      // Only the kind of resolution is shown: the value can be a URL with a credential.
      const local = entry.kind === "local" ? entry.label : undefined;
      dep.resolvedUnknownReason = local
        ? `the lockfile resolves it locally (${local})`
        : "the lockfile resolves it to a non-registry source";
      dep.local ??= {
        reason: local
          ? "resolved locally by the lockfile"
          : "resolved to a non-registry source by the lockfile",
        evidence: {
          kind: "fact",
          source: lockSource,
          description: local
            ? `resolves ${dep.name} locally (${local})`
            : `resolves ${dep.name} to a non-registry source`,
        },
      };
    } else {
      dep.resolvedUnknownReason =
        lockUnsupported ?? (lockSource ? "not found in the lockfile" : "no lockfile");
    }
    for (const dir of nodeModulesDirs) {
      const installedManifest = join(dir, "node_modules", dep.name, "package.json");
      let pkg: Record<string, unknown> | undefined;
      try {
        pkg = await readJson(fs, installedManifest);
      } catch {
        continue; // Not installed here: Node would look in the parent directory.
      }
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
      break;
    }
  }

  // Which file applies depends on the package manager: npm reads the
  // workspace root's .npmrc, pnpm the root's and the project's, yarn classic
  // every ancestor's .npmrc and .yarnrc, yarn berry every ancestor's
  // .yarnrc.yml and never .npmrc. All of them are read, and a registry counts
  // as public only if none says otherwise. ~/.npmrc is already in pnpm's
  // config; the yarn files in home are not (architecture.md §8, F-52).
  const dirs: string[] = [];
  for (let dir = root; ; dir = dirname(dir)) {
    dirs.unshift(dir);
    if (dir === stopAt || dirname(dir) === dir) break;
  }
  const registryFiles: [string, RegistryFile["format"]][] = [
    [".npmrc", "npmrc"],
    [".yarnrc", "yarnrc"],
    [".yarnrc.yml", "yarnrc.yml"],
  ];
  for (const dir of dirs) {
    for (const [name, format] of registryFiles) {
      if (format === "npmrc" && dir === stopAt && dir !== root) continue;
      const path = join(dir, name);
      if (!(await fs.exists(path))) continue;
      try {
        scan.registryFiles.push({ path, text: await fs.readText(path), format });
      } catch {
        scan.registryUnknown ??= `${path} could not be read`;
        scan.diagnostics.push({
          severity: "warning",
          source: "project",
          message: `${path} could not be read`,
        });
      }
    }
  }
  return scan;
}
