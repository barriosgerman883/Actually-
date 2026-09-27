# pnpm

## Purpose

Detect pnpm itself and the packages installed globally with pnpm, and read project dependencies installed by pnpm.

## Detection strategy

- `pnpm --version` tells whether pnpm exists and its version.
- `pnpm root --global` and `pnpm bin --global` locate the global directory and its bin directory.
- `pnpm list --global --json --depth=0` lists global packages with their versions and tarball URLs.
- The global `package.json`, next to the `pnpm root --global` directory, gives each package's declared spec.
- Each package's own `package.json` gives its `bin` names and `repository` field.

## Evidence used

| Claim | Evidence | Kind |
|---|---|---|
| installed version | `pnpm list` reports `name@version` | fact |
| installed by pnpm | `pnpm list` lists it; pnpm's bin directory provides its executables | fact |
| source | the package's `repository` field; repository name matches package name | inference |
| update provider | derived from installation, never more confident than it | inference |

For project dependencies: `package.json` (requested), `pnpm-lock.yaml` (resolved, including workspace importers) and `node_modules/<name>/package.json` (installed). The package manager comes from the `packageManager` field (fact) or the lockfile present (inference).

## Version detection

Installed versions come from pnpm. Latest versions come from the npm registry provider.

## Commands executed

`pnpm --version`, `pnpm root --global`, `pnpm bin --global`, `pnpm list --global --json --depth=0` and `pnpm config list --json`. All of them run in an empty directory owned by actually, never inside a project, with `npm_config_update_notifier=false` so pnpm does not contact the network by itself, and with corepack auto-pinning and download prompts disabled.

## Files inspected

The global `package.json`, installed packages' `package.json`, and in projects: `package.json`, `pnpm-lock.yaml`, `node_modules/*/package.json`, `.npmrc`.

## Network requests

None. See npm-registry.md.

## Failure modes

- pnpm is not installed: no pnpm records and no diagnostic.
- `pnpm bin --global` prints nothing when `PNPM_HOME` is not configured: executables are not attributed and no bin evidence is added.
- Unparseable output: a warning diagnostic, and the scan continues.

## Security considerations

pnpm is never run inside a project, because a project's `.npmrc` or `packageManager` field could run code through corepack. `pnpm config list --json` can print auth tokens: only `registry` and `@scope:registry` keys are extracted, and the rest is discarded without being logged.

## Known limitations

- How pnpm itself was installed is not determined.
- Windows is not supported: pnpm is a `.cmd` shim there, which cannot be run without a shell.
- Yarn and Bun lockfiles are detected but not read.
