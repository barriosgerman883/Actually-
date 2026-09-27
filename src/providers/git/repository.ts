import { isAbsolute, join, resolve } from "node:path";
import semver from "semver";
import type { Evidence } from "../../core/model.js";
import type { CommandRunner, Filesystem } from "../../core/ports.js";
import { parseGithubUrl, type GithubRepo } from "../github/url.js";

export interface GitRemote {
  name: string;
  url: string;
}

export interface GitRepository {
  root: string;
  gitDir: string;
  branch?: string;
  commit?: string;
  remotes: GitRemote[];
  github?: { repo: GithubRepo; remote: string; evidence: Evidence };
}

async function resolveGitDir(fs: Filesystem, root: string): Promise<string | undefined> {
  const dotGit = join(root, ".git");
  if (await fs.isDirectory(dotGit)) return dotGit;
  if (!(await fs.exists(dotGit))) return undefined;
  // Worktrees and submodules: ".git" is a file with "gitdir: <path>".
  const match = /^gitdir:\s*(.+)\s*$/m.exec(await fs.readText(dotGit));
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
): Promise<GitRepository | undefined> {
  const gitDir = await resolveGitDir(fs, root);
  if (!gitDir) return undefined;
  const commonDirText = await readOptional(fs, join(gitDir, "commondir"));
  const commonDir = commonDirText ? resolve(gitDir, commonDirText.trim()) : gitDir;
  const repo: GitRepository = { root, gitDir, remotes: [] };

  const head = (await readOptional(fs, join(gitDir, "HEAD")))?.trim();
  if (head?.startsWith("ref:")) {
    const ref = head.slice(4).trim();
    if (ref.startsWith("refs/heads/")) repo.branch = ref.slice("refs/heads/".length);
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
  const github = preferred ? parseGithubUrl(preferred.url) : undefined;
  if (preferred && github) {
    repo.github = {
      repo: github,
      remote: preferred.name,
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

function asVersion(tag: string): string | undefined {
  const cleaned = tag.trim().replace(/^v/, "");
  return semver.valid(cleaned) ?? undefined;
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
    .map((t) => ({ tag: t.trim(), version: asVersion(t) }))
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
    info.unknownEvidence.push({
      kind: "fact",
      source: "git describe --tags --long HEAD",
      description: "no reachable tag",
    });
  }
  return info;
}
