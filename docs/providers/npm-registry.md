# npm registry

## Purpose

Resolve the latest version of npm packages and read their `repository` field.

## Detection strategy

A package is queried on `registry.npmjs.org` only if all of these hold:

1. its spec is a registry spec: a semver range or a dist-tag, not `npm:`, `workspace:`, `link:`, `file:`, git or a URL;
2. the effective default registry is `https://registry.npmjs.org/`;
3. its scope is not mapped to another registry;
4. when pnpm reports the tarball, it came from `registry.npmjs.org`;
5. its name is not in `[network] exclude`.

The effective registry comes from `pnpm config list --json`, with the project's `.npmrc` applied on top. A registry set through `${VAR}` cannot be resolved safely, so nothing is queried. If any condition cannot be determined, the package is not queried and `latest` is unknown with the reason.

## Evidence used

| Claim | Evidence | Kind |
|---|---|---|
| latest | `dist-tag "latest" is X` from the registry | fact |
| latest is a prerelease | semver prerelease suffix | inference, lowers confidence to low |
| cached value | cache entry date; stale entries cap confidence at medium | fact |

## Version detection

`GET https://registry.npmjs.org/<name>/latest`. The `latest` dist-tag is chosen by the publisher: using it for the latest stable release is a convention, not a guarantee.

## Commands executed

`pnpm config list --json`.

## Files inspected

The project's `.npmrc`.

## Network requests

`GET https://registry.npmjs.org/<name>/latest`. The registry receives the package name, the IP address and the user agent `actually/<version>`. Responses are cached for 6 hours by default and revalidated with `If-None-Match` or `If-Modified-Since`.

## Failure modes

404: unknown, "not found in the public registry". Network failure: a stale cached value if there is one, otherwise unknown.

## Security considerations

The origin rule prevents private package names from being sent to the public registry. Scoped names are URL-encoded, and names that could alter the path are rejected.

## Known limitations

Private registries are never queried. Their packages always have an unknown latest version.
