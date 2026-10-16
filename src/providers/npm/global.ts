import { basename, dirname, join, sep } from "node:path";
import semver from "semver";
import { pathDirs } from "../../core/command-path.js";
import type { Evidence } from "../../core/model.js";
import type { Environment, Filesystem } from "../../core/ports.js";
import { launcherTarget, type Executable } from "../../scanners/bin-scanner.js";
import { binNames } from "../shared/manifest.js";
import { readJsonObjectIfAny } from "../shared/read-json.js";
import { repositoryField } from "../shared/repository-field.js";

/** A directory where npm keeps global packages (docs/providers/npm.md). */
export interface NpmPrefix {
  /** The prefix, as its real path. */
  dir: string;
  /** Where its global packages are. */
  modulesDir: string;
  /** Where their commands are: the prefix itself on Windows, prefix/bin elsewhere. */
  binDir: string;
  /** Why this directory is taken as a prefix. */
  evidence: Evidence;
  packages: NpmGlobalPackage[];
}

export interface NpmGlobalPackage {
  name: string;
  dir: string;
  version?: string;
  versionEvidence?: Evidence;
  bins: string[];
  repository?: string;
  /** Set for a link, such as one `npm link` makes: where its files are. */
  linkedTo?: string;
  /** Its commands in the prefix's bin directory, each running a file inside it. */
  commands: Executable[];
}

/** Each package directory of a node_modules: `name` and `@scope/name`, never dot entries. */
async function packageDirs(
  fs: Filesystem,
  modulesDir: string,
): Promise<{ name: string; dir: string; link: boolean }[]> {
  const out: { name: string; dir: string; link: boolean }[] = [];
  const entries = await fs.readDir(modulesDir).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    if (entry.kind !== "directory" && entry.kind !== "symlink") continue;
    if (!entry.name.startsWith("@")) {
      out.push({
        name: entry.name,
        dir: join(modulesDir, entry.name),
        link: entry.kind === "symlink",
      });
      continue;
    }
    const scoped = await fs.readDir(join(modulesDir, entry.name)).catch(() => []);
    for (const child of scoped.sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.name.startsWith(".")) continue;
      if (child.kind !== "directory" && child.kind !== "symlink") continue;
      out.push({
        name: `${entry.name}/${child.name}`,
        dir: join(modulesDir, entry.name, child.name),
        link: child.kind === "symlink",
      });
    }
  }
  return out;
}

const isInside = (path: string, dir: string) =>
  path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);

/**
 * The commands of a package that npm wrote into the bin directory, looked up
 * by name: `<bin>.cmd` on Windows, read as a launcher, and `<bin>`, a link,
 * elsewhere. A command counts only when it runs a file inside the package.
 * On Windows the file it runs may be missing; a link whose target is
 * missing cannot be told apart from no command through a read-only port.
 */
async function packageCommands(
  fs: Filesystem,
  pkg: { bins: string[]; dir: string; linkedTo?: string },
  binDir: string,
  windows: boolean,
): Promise<Executable[]> {
  const commands: Executable[] = [];
  for (const bin of pkg.bins) {
    const path = join(binDir, windows ? `${bin}.cmd` : bin);
    if (!(await fs.exists(path).catch(() => false))) continue;
    const target = windows
      ? await launcherTarget(fs, path)
      : await fs.realpath(path).catch(() => undefined);
    if (!target) continue;
    if (!isInside(target, pkg.dir) && !(pkg.linkedTo && isInside(target, pkg.linkedTo))) continue;
    commands.push({ name: bin, dir: binDir, path, realPath: target, viaLauncher: windows });
  }
  return commands;
}

/** The global packages of one candidate prefix, read from their package.json files. */
async function scanPackages(
  fs: Filesystem,
  modulesDir: string,
  binDir: string,
  windows: boolean,
): Promise<NpmGlobalPackage[]> {
  const packages: NpmGlobalPackage[] = [];
  for (const { name, dir, link } of await packageDirs(fs, modulesDir)) {
    const manifestPath = join(dir, "package.json");
    const manifest = await readJsonObjectIfAny(fs, manifestPath);
    const pkg: NpmGlobalPackage = { name, dir, bins: [], commands: [] };
    if (link) pkg.linkedTo = await fs.realpath(dir).catch(() => dir);
    if (manifest) {
      const version = typeof manifest.version === "string" ? manifest.version : undefined;
      if (version && semver.valid(version)) {
        pkg.version = version;
        pkg.versionEvidence = {
          kind: "fact",
          source: manifestPath,
          description: `declares version ${version}`,
        };
      }
      pkg.bins = binNames(manifest, name);
      pkg.repository = repositoryField(manifest);
    }
    pkg.commands = await packageCommands(fs, pkg, binDir, windows);
    packages.push(pkg);
  }
  return packages;
}

/**
 * The npm global prefixes whose commands are in PATH, with their packages.
 * npm keeps no record of its prefix that can be read without running it,
 * so the layout decides: on Windows, a PATH directory with node_modules in
 * it; elsewhere, a PATH directory named bin with ../lib/node_modules. A
 * node_modules alone is not enough, since programs leave one in places
 * such as C:\Windows\System32: some package must have a command in the
 * directory that runs a file inside it. npm is never run, and npm records
 * no spec or tarball for a global package, so where one came from is never
 * known. A prefix whose commands are not in PATH is not found.
 */
export async function findNpmPrefixes(fs: Filesystem, env: Environment): Promise<NpmPrefix[]> {
  const windows = env.platform === "win32";
  const prefixes: NpmPrefix[] = [];
  for (const entry of pathDirs(env.get("PATH"), env.platform)) {
    if (!windows && basename(entry) !== "bin") continue;
    const candidate = windows ? entry : dirname(entry);
    const layout = windows ? ["node_modules"] : ["lib", "node_modules"];
    if (!(await fs.isDirectory(join(candidate, ...layout)).catch(() => false))) continue;
    const dir = await fs.realpath(candidate).catch(() => candidate);
    if (prefixes.some((p) => p.dir === dir)) continue;
    const modulesDir = join(dir, ...layout);
    const binDir = windows ? dir : join(dir, "bin");
    const packages = await scanPackages(fs, modulesDir, binDir, windows);
    if (!packages.some((p) => p.commands.length > 0)) continue;
    prefixes.push({
      dir,
      modulesDir,
      binDir,
      packages,
      evidence: {
        kind: "inference",
        source: modulesDir,
        description: `${entry} is in PATH and has ${layout.join("/")} with packages whose commands it holds, the layout of an npm global prefix`,
      },
    });
  }
  return prefixes;
}
