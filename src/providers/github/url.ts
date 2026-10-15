export interface GithubRepo {
  owner: string;
  repo: string;
}

const PART = /^[A-Za-z0-9_.-]+$/;

/**
 * Parses the GitHub repository out of a remote URL or an npm `repository`
 * field. Returns undefined for anything that is not clearly github.com.
 *
 * The npm shorthands `owner/repo` and `github:owner/repo` are accepted only
 * for npm: in a Git remote, `backups/tool` or `../upstream` is a local path
 * (architecture.md §8, F-44).
 */
export function parseGithubUrl(
  raw: string,
  options: { npmShorthand?: boolean } = {},
): GithubRepo | undefined {
  const shorthand = options.npmShorthand ?? true;
  let text = raw.trim();
  if (shorthand && text.startsWith("github:")) text = text.slice("github:".length);
  else if (shorthand && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text)) {
    // npm shorthand "owner/repo" means GitHub.
  } else {
    const scp = /^[^@/\s]+@github\.com:(.+)$/.exec(text);
    if (scp?.[1]) {
      text = scp[1];
    } else {
      let url: URL;
      try {
        url = new URL(text.replace(/^git\+/, ""));
      } catch {
        return undefined;
      }
      if (
        url.hostname.toLowerCase() !== "github.com" &&
        url.hostname.toLowerCase() !== "www.github.com"
      ) {
        return undefined;
      }
      text = url.pathname.replace(/^\/+/, "");
    }
  }
  const [owner, repoWithSuffix] = text.replace(/\/+$/, "").split("/");
  const repo = repoWithSuffix?.replace(/\.git$/, "");
  if (!owner || !repo || !PART.test(owner) || !PART.test(repo)) return undefined;
  if ([owner, repo].some((part) => part === "." || part === "..")) return undefined;
  return { owner, repo };
}

export function githubWebUrl(repo: GithubRepo): string {
  return `https://github.com/${repo.owner}/${repo.repo}`;
}
