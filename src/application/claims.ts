import { claimFrom } from "../core/confidence.js";
import type { Claim, Evidence, ToolSource } from "../core/model.js";
import { githubWebUrl, parseGithubUrl } from "../providers/github/url.js";

/**
 * Source from an npm `repository` field. It is an inference: the field is
 * written by the publisher and nothing verifies it. A matching repository
 * name adds a second, independent inference (docs/architecture.md §6).
 */
export function sourceFromRepository(
  packageName: string,
  repository: string | undefined,
  origin: string,
): Claim<ToolSource> {
  if (!repository)
    return { state: "unknown", reason: "package metadata has no repository field", evidence: [] };
  const gh = parseGithubUrl(repository);
  if (!gh) {
    return {
      state: "unknown",
      reason: "repository is not a GitHub URL",
      evidence: [{ kind: "fact", source: origin, description: `"repository" is ${repository}` }],
    };
  }
  const evidence: Evidence[] = [
    {
      kind: "inference",
      source: origin,
      description: `"repository" points to github.com/${gh.owner}/${gh.repo}`,
    },
  ];
  const shortName = packageName.startsWith("@")
    ? packageName.slice(packageName.indexOf("/") + 1)
    : packageName;
  if (gh.repo.toLowerCase() === shortName.toLowerCase()) {
    evidence.push({
      kind: "inference",
      source: "name comparison",
      description: "repository name matches the package name",
    });
  }
  return claimFrom(
    { provider: "github", identifier: `${gh.owner}/${gh.repo}`, url: githubWebUrl(gh) },
    evidence,
  );
}

/** Derives the informational update claim from the installation claim. */
export function updateFrom(installation: Claim<{ provider: string }>): Claim<{ provider: string }> {
  if (installation.state !== "known") {
    return { state: "unknown", reason: "installation method is unknown", evidence: [] };
  }
  // Same evidence as the installation, plus the inference that updates
  // follow the installer. It can never be more certain than the
  // installation it is derived from (§6).
  return claimFrom(
    { provider: installation.value.provider },
    [
      ...installation.evidence,
      {
        kind: "inference",
        source: "installation",
        description: `the installer, ${installation.value.provider}, is what would update it`,
      },
    ],
    { cap: installation.confidence },
  );
}
