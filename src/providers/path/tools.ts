import { basename, dirname, join, sep } from "node:path";
import semver from "semver";
import type { Evidence } from "../../core/model.js";
import type { Filesystem } from "../../core/ports.js";
import type { Executable } from "../../scanners/bin-scanner.js";

/**
 * Developer tools looked up by name on PATH (docs/providers/path.md, ADR
 * 0011). Their version is read from a file when one states it; nothing is
 * ever run. npm and pnpm are not here: their own providers report them.
 */
export const PATH_TOOLS = [
  "git",
  "node",
  "go",
  "java",
  "python",
  "python3",
  "deno",
  "bun",
  "docker",
  "gh",
  "rustc",
  "cargo",
] as const;

export type PathToolVersion =
  | { version: string; evidence: Evidence }
  | { version?: undefined; reason: string; evidence: Evidence[] };

const NOT_STATED = "actually does not run it, and no file states its version";

/** Directories from `dir` up to `levels` parents, nearest first. */
function upFrom(dir: string, levels: number): string[] {
  const dirs = [dir];
  for (let i = 0; i < levels; i++) {
    const parent = dirname(dirs[dirs.length - 1] as string);
    if (parent === dirs[dirs.length - 1]) break;
    dirs.push(parent);
  }
  return dirs;
}

async function readIfAny(fs: Filesystem, path: string): Promise<string | undefined> {
  try {
    return await fs.readText(path);
  } catch {
    return undefined;
  }
}

/** Git for Windows ships its own release notes, headed by the version installed. */
async function gitVersion(fs: Filesystem, exe: Executable): Promise<PathToolVersion | undefined> {
  for (const dir of upFrom(dirname(exe.realPath), 3)) {
    const file = join(dir, "ReleaseNotes.html");
    const text = await readIfAny(fs, file);
    const match = text && /Git for Windows v(\d+\.\d+\.\d+)/.exec(text);
    if (match?.[1])
      return {
        version: match[1],
        evidence: {
          kind: "inference",
          source: file,
          description: `the release notes installed with Git for Windows start at v${match[1]}`,
        },
      };
  }
  return undefined;
}

/** Official Node.js archives for Linux and macOS include node_version.h. */
async function nodeVersion(fs: Filesystem, exe: Executable): Promise<PathToolVersion | undefined> {
  for (const dir of upFrom(dirname(exe.realPath), 1)) {
    const file = join(dir, "include", "node", "node_version.h");
    const text = await readIfAny(fs, file);
    if (!text) continue;
    const part = (n: string) => new RegExp(`#define NODE_${n}_VERSION (\\d+)`).exec(text)?.[1];
    const version = `${part("MAJOR")}.${part("MINOR")}.${part("PATCH")}`;
    if (semver.valid(version))
      return {
        version,
        evidence: { kind: "fact", source: file, description: `defines version ${version}` },
      };
  }
  // fnm, nvm, nvm-windows and Volta keep each version in a directory named after it.
  const segment = exe.realPath.split(/[\\/]/).find((s) => /^v?\d+\.\d+\.\d+$/.test(s));
  const version = segment && semver.valid(segment.replace(/^v/, ""));
  if (version)
    return {
      version,
      evidence: {
        kind: "inference",
        source: exe.realPath,
        description: `its path has a directory named ${segment}, as version managers name them`,
      },
    };
  return undefined;
}

/** A Go distribution has a VERSION file at its root: go1.22.5. */
async function goVersion(fs: Filesystem, exe: Executable): Promise<PathToolVersion | undefined> {
  const file = join(dirname(dirname(exe.realPath)), "VERSION");
  const match = /^go(\d+\.\d+(?:\.\d+)?)/.exec((await readIfAny(fs, file)) ?? "");
  const version = match?.[1] && semver.coerce(match[1])?.version;
  if (!version) return undefined;
  return { version, evidence: { kind: "fact", source: file, description: `states ${match[0]}` } };
}

/** A JDK or JRE has a release file at its root: JAVA_VERSION="21.0.2". */
async function javaVersion(fs: Filesystem, exe: Executable): Promise<PathToolVersion | undefined> {
  const file = join(dirname(dirname(exe.realPath)), "release");
  const match = /^JAVA_VERSION="([^"]+)"/m.exec((await readIfAny(fs, file)) ?? "");
  const version = match?.[1] && semver.coerce(match[1])?.version;
  if (!version) return undefined;
  return {
    version,
    evidence: { kind: "fact", source: file, description: `states JAVA_VERSION="${match[1]}"` },
  };
}

const READERS: Partial<
  Record<string, (fs: Filesystem, exe: Executable) => Promise<PathToolVersion | undefined>>
> = { git: gitVersion, node: nodeVersion, go: goVersion, java: javaVersion };

/**
 * Windows puts app execution aliases in this directory. An alias such as
 * python.exe may only open the Microsoft Store, so it proves nothing.
 */
export function isStoreAlias(exe: Executable): boolean {
  return [exe.path, exe.realPath].some((p) =>
    p.toLowerCase().includes(`${sep}microsoft${sep}windowsapps${sep}`.toLowerCase()),
  );
}

/** The version of a tool found on PATH, or why it is not known. */
export async function pathToolVersion(fs: Filesystem, exe: Executable): Promise<PathToolVersion> {
  const found: Evidence = { kind: "fact", source: exe.path, description: "found in PATH" };
  if (isStoreAlias(exe))
    return {
      reason: "an app execution alias of the Microsoft Store; it may only open the Store",
      evidence: [found],
    };
  const read = READERS[basename(exe.name)];
  const result = read ? await read(fs, exe) : undefined;
  return result ?? { reason: NOT_STATED, evidence: [found] };
}
