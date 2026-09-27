export interface GithubRepo {
  owner: string;
  repo: string;
}

const PART = /^[A-Za-z0-9_.-]+$/;

/**
 * Parses the GitHub repository out of a remote URL or an npm `repository`
 * field. Returns undefined for anything that is not clearly github.com.
 */
export function parseGithubUrl(raw: string): GithubRepo | undefined {
  let text = raw.trim();
  if (text.startsWith("github:")) text = text.slice("github:".length);
  else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text)) {
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
  return { owner, repo };
}

export function githubWebUrl(repo: GithubRepo): string {
  return `https://github.com/${repo.owner}/${repo.repo}`;
}
