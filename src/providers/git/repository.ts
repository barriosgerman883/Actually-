import { isAbsolute, join, resolve } from "node:path";
import semver from "semver";
import type { Diagnostic, Evidence } from "../../core/model.js";
import type { CommandRunner, Filesystem } from "../../core/ports.js";
import { parseGithubUrl, type GithubRepo } from "../github/url.js";
import { tagVersion } from "../shared/tag-version.js";

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitRepository {
  root: string;
  gitDir: string;
  commit?: string;
  remotes: GitRemote[];
  github?: { repo: GithubRepo; evidence: Evidence };
}

async function resolveGitDir(
  fs: Filesystem,
  root: string,
  diagnostics: Diagnostic[],
): Promise<string | undefined> {
  const dotGit = join(root, ".git");
  if (await fs.isDirectory(dotGit)) return dotGit;
  let present: boolean;
  try {
    present = await fs.exists(dotGit);
  } catch {
    present = true; // It is there but cannot be checked: reading it reports why.
  }
  if (!present) return undefined;
  // Worktrees and submodules: ".git" is a file with "gitdir: <path>". One
  // that cannot be read skips this repository, not the run (RA-009, F-38).
  const text = await readOptional(fs, dotGit);
  if (text === undefined) {
    diagnostics.push({
      severity: "warning",
      source: "git",
      message: `${dotGit} could not be read`,
    });
    return undefined;
  }
  const match = /^gitdir:\s*(.+)\s*$/m.exec(text);
  if (!match?.[1]) return undefined;
  const target = match[1].trim();
  return isAbsolute(target) ? target : resolve(root, target);
}

async function readOptional(fs: Filesystem, path: string): Promise<string | undefined> {
  try {
    return await fs.readText(path);
  } catch {
    return undefined;
  }
}

export function parseRemotes(configText: string): GitRemote[] {
  const remotes: GitRemote[] = [];
  let current: string | undefined;
  for (const raw of configText.split(/\r?\n/)) {
    const line = raw.trim();
    const section = /^\[\s*remote\s+"([^"]+)"\s*\]$/.exec(line);
    if (section) {
      current = section[1];
      continue;
    }
    if (line.startsWith("[")) {
      current = undefined;
      continue;
    }
    const kv = /^url\s*=\s*(.+)$/.exec(line);
    if (current && kv?.[1]) remotes.push({ name: current, url: kv[1].trim() });
  }
  return remotes;
}

/**
 * Reads repository metadata from files only: HEAD, refs, packed-refs and
 * config (docs/architecture.md §7). A repository found on disk is not
 * trusted, so nothing here runs git.
 */
export async function readRepository(
  fs: Filesystem,
  root: string,
  diagnostics: Diagnostic[] = [],
): Promise<GitRepository | undefined> {
  const gitDir = await resolveGitDir(fs, root, diagnostics);
  if (!gitDir) return undefined;
  const commonDirText = await readOptional(fs, join(gitDir, "commondir"));
  const commonDir = commonDirText ? resolve(gitDir, commonDirText.trim()) : gitDir;
  const repo: GitRepository = { root, gitDir, remotes: [] };

  const head = (await readOptional(fs, join(gitDir, "HEAD")))?.trim();
  if (head?.startsWith("ref:")) {
    const ref = head.slice(4).trim();
    const loose = (await readOptional(fs, join(commonDir, ref)))?.trim();
    if (loose && /^[0-9a-f]{40,64}$/.test(loose)) {
      repo.commit = loose;
    } else {
      const packed = await readOptional(fs, join(commonDir, "packed-refs"));
      const line = packed?.split(/\r?\n/).find((l) => l.endsWith(` ${ref}`));
      const sha = line?.split(" ")[0];
      if (sha && /^[0-9a-f]{40,64}$/.test(sha)) repo.commit = sha;
    }
  } else if (head && /^[0-9a-f]{40,64}$/.test(head)) {
    repo.commit = head;
  }

  repo.remotes = parseRemotes((await readOptional(fs, join(commonDir, "config"))) ?? "");
  const preferred = repo.remotes.find((r) => r.name === "origin") ?? repo.remotes[0];
  const github = preferred ? parseGithubUrl(preferred.url, { npmShorthand: false }) : undefined;
  if (preferred && github) {
    repo.github = {
      repo: github,
      evidence: {
        kind: "fact",
        source: join(commonDir, "config"),
        description: `remote "${preferred.name}" points to github.com/${github.owner}/${github.repo}`,
      },
    };
  }
  return repo;
}

export interface TagInfo {
  version?: { value: string; evidence: Evidence };
  unknownEvidence: Evidence[];
  failure?: string;
}

/**
 * The installed version of a repository used as a tool: the highest semver
 * tag on HEAD. Without one, the version is unknown and the evidence records
 * the commit and the distance to the last tag (docs/mvp.md §5.3).
 */
export async function installedFromTags(
  runner: CommandRunner,
  repo: GitRepository,
): Promise<TagInfo> {
  const info: TagInfo = { unknownEvidence: [] };
  const tags = await runner.run({ command: "git.tags.head", repository: repo.root });
  if (!tags.ok) {
    info.failure = tags.message;
    return info;
  }
  const versions = tags.stdout
    .split(/\r?\n/)
    .map((t) => ({ tag: t.trim(), version: tagVersion(t) }))
    .filter((t): t is { tag: string; version: string } => t.version !== undefined)
    .sort((a, b) => semver.rcompare(a.version, b.version));
  const best = versions[0];
  if (best) {
    info.version = {
      value: best.version,
      evidence: {
        kind: "fact",
        source: "git tag --points-at HEAD",
        description: `HEAD is tagged ${best.tag}`,
      },
    };
    return info;
  }
  if (repo.commit) {
    info.unknownEvidence.push({
      kind: "fact",
      source: join(repo.gitDir, "HEAD"),
      description: `HEAD is at commit ${repo.commit.slice(0, 12)}`,
    });
  }
  const describe = await runner.run({ command: "git.describe.head", repository: repo.root });
  if (describe.ok) {
    const match = /^(.*)-(\d+)-g[0-9a-f]+$/.exec(describe.stdout.trim());
    if (match?.[1] && match[2]) {
      info.unknownEvidence.push({
        kind: "fact",
        source: "git describe --tags --long HEAD",
        description: `${match[2]} commits after tag ${match[1]}`,
      });
    }
  } else {
    // Only git saying it found no names means there is no tag. A timeout
    // or a safe.directory refusal says nothing about tags.
    const noNames = /No names found|No tags can describe/.test(describe.message);
    info.unknownEvidence.push({
      kind: "fact",
      source: "git describe --tags --long HEAD",
      description: noNames ? "no reachable tag" : describe.message,
    });
    // Any other failure is a failed provider: an error, not just evidence (F-43).
    if (!noNames) info.failure = describe.message;
  }
  return info;
}
