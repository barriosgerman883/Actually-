import { dirname, join, sep } from "node:path";
import semver from "semver";
import type { Diagnostic, Evidence } from "../../core/model.js";
import type { CommandRunner, Filesystem } from "../../core/ports.js";
import { repositoryField } from "../shared/repository-field.js";

export interface PnpmGlobalPackage {
  name: string;
  installedVersion?: string;
  /** Declared spec, for example "7.5.0" or "link:../x". */
  spec?: string;
  /** Where the spec came from: the package.json that declares it, or pnpm list. */
  specSource?: string;
  /** Tarball pnpm reports it was installed from. */
  resolved?: string;
  dir?: string;
  bins: string[];
  repository?: string;
  evidence: Evidence[];
}

export interface PnpmGlobalScan {
  installed: boolean;
  version?: string;
  versionEvidence: Evidence[];
  rootDir?: string;
  binDir?: string;
  packages: PnpmGlobalPackage[];
  diagnostics: Diagnostic[];
}

interface ListedDependency {
  version?: unknown;
  resolved?: unknown;
  path?: unknown;
}

function binNames(manifest: Record<string, unknown>, packageName: string): string[] {
  const bin = manifest.bin;
  if (typeof bin === "string") {
    return [
      packageName.startsWith("@") ? packageName.slice(packageName.indexOf("/") + 1) : packageName,
    ];
  }
  if (typeof bin === "object" && bin !== null) return Object.keys(bin);
  return [];
}

async function readJson(
  fs: Filesystem,
  path: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readText(path));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * pnpm 12.10 on Windows reports package paths with the long-path prefix
 * (`\\?\C:\…`), while `pnpm root --global` has none, so the two never match
 * as text (F-67). The prefix is dropped from every path pnpm reports.
 */
function withoutLongPathPrefix(path: string): string {
  if (path.startsWith("\\\\?\\UNC\\")) return `\\\\${path.slice(8)}`;
  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
}

/**
 * The package.json files that can declare a global package's spec. pnpm 10
 * keeps one for every global package next to `pnpm root --global`; pnpm 12
 * gives each package its own directory directly inside that root. A
 * package.json anywhere else is never used: it could belong to a project.
 */
function specManifests(rootDir: string, packagePath: unknown): string[] {
  const manifests = [join(dirname(rootDir), "package.json")];
  if (typeof packagePath === "string") {
    const i = packagePath.indexOf(`${sep}node_modules${sep}`);
    const dir = i > 0 ? packagePath.slice(0, i) : undefined;
    if (dir && dirname(dir) === rootDir) manifests.push(join(dir, "package.json"));
  }
  return manifests;
}

/**
 * Inspects pnpm's global installation (docs/providers/pnpm.md).
 *
 * Installed versions come from `pnpm list --global --json` (fact). Specs
 * come from the global package.json that declares each package (see
 * specManifests), which the npm-registry origin rule needs. pnpm is never
 * run inside a project.
 */
/** actually never lets Corepack download pnpm (F-39): say how to do it by hand. */
function withCorepackHint(message: string): string {
  return /network access disabled/i.test(message)
    ? `${message} (Corepack has not downloaded this pnpm version yet; run pnpm --version once outside any project)`
    : message;
}

export async function scanPnpmGlobal(
  runner: CommandRunner,
  fs: Filesystem,
): Promise<PnpmGlobalScan> {
  const scan: PnpmGlobalScan = {
    installed: false,
    versionEvidence: [],
    packages: [],
    diagnostics: [],
  };

  const version = await runner.run({ command: "pnpm.version" });
  if (!version.ok) {
    // A missing pnpm is a valid but incomplete result; any other failure is
    // an error. Both are reported: a silent gap looks like "nothing found"
    // (architecture.md §13, F-55).
    scan.diagnostics.push(
      version.reason === "not-found"
        ? {
            severity: "warning",
            source: "pnpm",
            message: `${version.message}: global packages were not checked`,
          }
        : { severity: "error", source: "pnpm", message: withCorepackHint(version.message) },
    );
    return scan;
  }
  scan.installed = true;
  const v = version.stdout.trim();
  if (semver.valid(v)) {
    scan.version = v;
    scan.versionEvidence.push({
      kind: "fact",
      source: "pnpm --version",
      description: `reports ${v}`,
    });
  }

  const root = await runner.run({ command: "pnpm.root.global" });
  if (root.ok && root.stdout.trim()) scan.rootDir = withoutLongPathPrefix(root.stdout.trim());
  const bin = await runner.run({ command: "pnpm.bin.global" });
  if (bin.ok && bin.stdout.trim()) scan.binDir = withoutLongPathPrefix(bin.stdout.trim());

  const list = await runner.run({ command: "pnpm.list.global" });
  if (!list.ok) {
    scan.diagnostics.push({
      severity: "error",
      source: "pnpm",
      message: `could not list global packages: ${list.message}`,
    });
    return scan;
  }
  let listed: unknown;
  try {
    listed = JSON.parse(list.stdout || "[]");
  } catch {
    scan.diagnostics.push({
      severity: "error",
      source: "pnpm",
      message: "pnpm list output could not be parsed",
    });
    return scan;
  }
  const first = Array.isArray(listed)
    ? (listed[0] as Record<string, unknown> | undefined)
    : undefined;
  const deps = (first?.dependencies ?? {}) as Record<string, ListedDependency>;

  const manifests = new Map<string, Record<string, unknown> | undefined>();
  const declaredSpec = async (name: string, packagePath: unknown) => {
    if (!scan.rootDir) return undefined;
    for (const path of specManifests(scan.rootDir, packagePath)) {
      if (!manifests.has(path)) manifests.set(path, await readJson(fs, path));
      const declared = manifests.get(path)?.dependencies as Record<string, unknown> | undefined;
      const spec = declared?.[name];
      if (typeof spec === "string") return { spec, source: path };
    }
    return undefined;
  };

  for (const [name, dep] of Object.entries(deps)) {
    const pkg: PnpmGlobalPackage = { name, bins: [], evidence: [] };
    const packagePath = typeof dep.path === "string" ? withoutLongPathPrefix(dep.path) : undefined;
    if (typeof dep.version === "string" && semver.valid(dep.version)) {
      pkg.installedVersion = dep.version;
      pkg.evidence.push({
        kind: "fact",
        source: "pnpm list --global --json",
        description: `lists ${name}@${dep.version} as a global package`,
      });
    } else {
      pkg.evidence.push({
        kind: "fact",
        source: "pnpm list --global --json",
        description: `lists ${name} as a global package`,
      });
    }
    if (typeof dep.resolved === "string") pkg.resolved = dep.resolved;
    const declared = await declaredSpec(name, packagePath);
    if (declared) {
      pkg.spec = declared.spec;
      pkg.specSource = declared.source;
    } else if (typeof dep.version === "string" && !semver.valid(dep.version)) {
      pkg.spec = dep.version;
      pkg.specSource = "pnpm list --global --json";
    }
    if (packagePath) {
      pkg.dir = packagePath;
      const manifest = await readJson(fs, join(packagePath, "package.json"));
      if (manifest) {
        pkg.bins = binNames(manifest, name);
        pkg.repository = repositoryField(manifest);
      }
    }
    scan.packages.push(pkg);
  }
  return scan;
}
