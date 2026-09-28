# npm registry

## Purpose

Resolve the latest version of npm packages and read their `repository` field.

## Detection strategy

A package is queried on `registry.npmjs.org` only if all of these hold:

1. its spec is a registry spec: a semver range or a dist-tag, not `npm:`, `workspace:`, `link:`, `file:`, git or a URL;
2. it is not a package of the same workspace, and the lockfile does not resolve it to something other than a registry version;
3. every config source that could apply makes `https://registry.npmjs.org/` the default registry;
4. no source maps its scope to another registry;
5. when pnpm or the lockfile reports the tarball, it came from `registry.npmjs.org`;
6. its name is not in `[network] exclude`.

The config sources are `pnpm config list --json`, every `.npmrc` from the project up to home, every `.yarnrc.yml` (`npmRegistryServer`, `npmScopes`) and `.yarnrc` (`registry`, `"@scope:registry"`) from the project up to and including home, and `YARN_NPM_REGISTRY_SERVER`: which one applies depends on the package manager, so a registry counts as public only if none says otherwise. A registry set through `${VAR}`, or a file that cannot be read or parsed, cannot be resolved safely, so nothing is queried. If any condition cannot be determined, the package is not queried and `latest` is unknown with the reason. architecture.md §8 has the full rule, including how a workspace and its packages are found.

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

Every `.npmrc`, `.yarnrc` and `.yarnrc.yml` from the project up to home, the workspace markers (`pnpm-workspace.yaml`, `workspaces` in `package.json`) and the `package.json` of the workspace's packages, and the lockfile.

## Network requests

`GET https://registry.npmjs.org/<name>/latest`. The registry receives the package name, the IP address and the user agent `actually/<version>`. Responses are cached for 6 hours by default and revalidated with `If-None-Match` or `If-Modified-Since`.

## Failure modes

404: unknown, "not found in the public registry". Network failure: a stale cached value if there is one, otherwise unknown.

## Security considerations

The origin rule prevents private package names from being sent to the public registry. Scoped names are URL-encoded, and names that could alter the path are rejected.

## Known limitations

Private registries are never queried. Their packages always have an unknown latest version.
