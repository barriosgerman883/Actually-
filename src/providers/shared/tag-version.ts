import semver from "semver";

/** The semver version a tag names, with or without a leading `v`. */
export function tagVersion(tag: string): string | undefined {
  return semver.valid(tag.trim().replace(/^v/, "")) ?? undefined;
}
