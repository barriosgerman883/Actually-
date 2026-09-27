import { dirname, join } from "node:path";
import semver from "semver";
import type { Diagnostic, Evidence } from "../../core/model.js";
import type { CommandRunner, Filesystem } from "../../core/ports.js";

export interface PnpmGlobalPackage {
  name: string;
  installedVersion?: string;
  /** Spec from the global package.json, for example "7.5.0" or "link:../x". */
  spec?: string;
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
  globalManifest?: string;
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

function repositoryOf(manifest: Record<string, unknown>): string | undefined {
  const repo = manifest.repository;
  if (typeof repo === "string") return repo;
  if (
    typeof repo === "object" &&
    repo !== null &&
    typeof (repo as { url?: unknown }).url === "string"
  ) {
    return (repo as { url: string }).url;
  }
  return undefined;
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
 * Inspects pnpm's global installation (docs/providers/pnpm.md).
 *
 * Installed versions come from `pnpm list --global --json` (fact). Specs
 * come from the global package.json next to `pnpm root --global`, which the
 * npm-registry origin rule needs. pnpm is never run inside a project.
 */
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
    if (version.reason !== "not-found") {
      scan.diagnostics.push({ severity: "error", source: "pnpm", message: version.message });
    }
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
  if (root.ok && root.stdout.trim()) scan.rootDir = root.stdout.trim();
  const bin = await runner.run({ command: "pnpm.bin.global" });
  if (bin.ok && bin.stdout.trim()) scan.binDir = bin.stdout.trim();

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

  let specs: Record<string, unknown> = {};
  if (scan.rootDir) {
    scan.globalManifest = join(dirname(scan.rootDir), "package.json");
    const manifest = await readJson(fs, scan.globalManifest);
    specs = { ...((manifest?.dependencies as Record<string, unknown>) ?? {}) };
  }

  for (const [name, dep] of Object.entries(deps)) {
    const pkg: PnpmGlobalPackage = { name, bins: [], evidence: [] };
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
    const spec = specs[name];
    if (typeof spec === "string") pkg.spec = spec;
    else if (typeof dep.version === "string" && !semver.valid(dep.version)) pkg.spec = dep.version;
    if (typeof dep.path === "string") {
      pkg.dir = dep.path;
      const manifest = await readJson(fs, join(dep.path, "package.json"));
      if (manifest) {
        pkg.bins = binNames(manifest, name);
        pkg.repository = repositoryOf(manifest);
      }
    }
    scan.packages.push(pkg);
  }
  return scan;
}
