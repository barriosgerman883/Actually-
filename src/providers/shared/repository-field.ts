/** The `repository` field of a package manifest, as a string or `{ url }`. */
export function repositoryField(manifest: Record<string, unknown>): string | undefined {
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
