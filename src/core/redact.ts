/**
 * A spec or version that is a URL, shown as its scheme and host only. Its
 * user info, path or query can carry a credential, such as
 * `https://user:TOKEN@files.corp.example/a.tgz` (F-53). Anything else is
 * returned unchanged.
 */
export function redactSpec(spec: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(spec.trim());
  if (!scheme) return spec;
  try {
    const url = new URL(spec.trim());
    return `${url.protocol}//${url.host}/…`;
  } catch {
    return `${scheme[1] ?? ""}://…`;
  }
}
