# pnpm

## Purpose

Detect pnpm itself and the packages installed globally with pnpm, and read project dependencies installed by pnpm.

## Detection strategy

- `pnpm --version` tells whether pnpm exists and its version.
- `pnpm root --global` and `pnpm bin --global` locate the global directory and its bin directory.
- `pnpm list --global --json --depth=0` lists global packages with their versions and paths. pnpm 10 also reports tarball URLs; pnpm 12 does not.
- The global `package.json` that declares each package gives its spec. With pnpm 10, that is the one next to the `pnpm root --global` directory. With pnpm 12, each package has its own directory directly inside `pnpm root --global`, with its own `package.json`. No other `package.json` is used, because it could belong to a project.
- Each package's own `package.json` gives its `bin` names and `repository` field.

## Evidence used

| Claim | Evidence | Kind |
|---|---|---|
| installed version | `pnpm list` reports `name@version` | fact |
| installed by pnpm | `pnpm list` lists it; pnpm's bin directory provides its executables | fact |
| source | the package's `repository` field; repository name matches package name | inference |
| update provider | derived from installation, never more confident than it | inference |

For project dependencies: `package.json` (requested), `pnpm-lock.yaml` (resolved, including workspace importers) or `package-lock.json` (the project's, or its npm workspace root's when it lists the project) and `node_modules/<name>/package.json` (installed, looked up from the project to its workspace root, as Node does). The package manager comes from the `packageManager` field (fact) or the lockfile present (inference).

## Version detection

Installed versions come from pnpm. Latest versions come from the npm registry provider.

## Commands executed

`pnpm --version`, `pnpm root --global`, `pnpm bin --global`, `pnpm list --global --json --depth=0` and `pnpm config list --json`. All of them run in an empty directory owned by actually, never inside a project, with `npm_config_update_notifier=false` so pnpm does not contact the network by itself, and with corepack auto-pinning and download prompts disabled.

## Files inspected

The global `package.json` files described above, installed packages' `package.json`, and in projects: `package.json`, `pnpm-lock.yaml`, `node_modules/*/package.json`, `.npmrc`, `.yarnrc`, `.yarnrc.yml`.

## Network requests

None. See npm-registry.md.

## Failure modes

- pnpm cannot run (not installed, not in `PATH`, or a `.cmd` shim on Windows): no pnpm records, and a warning diagnostic saying global packages were not checked. The effective registry is unknown too, so a second warning says no package was queried. A silent gap would look like "nothing found".
- Any other failure of `pnpm --version` or `pnpm list`: an error diagnostic. actually runs pnpm with `COREPACK_ENABLE_NETWORK=0`, so a Corepack shim that has not downloaded its pnpm yet fails, and the diagnostic says to run `pnpm --version` once outside any project.
- `pnpm bin --global` prints nothing when `PNPM_HOME` is not configured: executables are not attributed and no bin evidence is added.
- Unparseable `pnpm list` output: an error diagnostic, and the scan continues with the other sources.

## Security considerations

pnpm is never run inside a project, because a project's `.npmrc` or `packageManager` field could run code through corepack. `pnpm config list --json` can print auth tokens: only `registry` and `@scope:registry` keys are extracted, and the rest is discarded without being logged. Of those keys, only whether each one is the public registry is kept, because a registry URL can carry a credential (architecture.md §8).

## Known limitations

- How pnpm itself was installed is not determined.
- Only the global packages of the pnpm that runs outside any project are seen: pnpm always runs from an empty directory (architecture.md §7), and each pnpm major keeps its global packages in its own place. What `pnpm add -g` installed inside a project whose `packageManager` pins another major is not listed. When that project is checked in the same run, a warning names both versions.
- Windows is not supported: pnpm is a `.cmd` shim there, which cannot be run without a shell.
- Yarn and Bun lockfiles are detected but not read.
- `pnpm-lock.yaml` is read in the formats of lockfile v5 (pnpm 7, peers as `_suffix`), v6 (pnpm 8) and v9 (pnpm 9 and later, peers as `(suffix)`). An older or unknown format leaves `resolved` unknown instead of guessing.
