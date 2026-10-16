# npm

## Purpose

List the packages installed with `npm install -g`, with their installed version, in every npm global prefix whose commands are in PATH.

## Detection strategy

- npm keeps no record of its global prefix that can be read without running it, so the layout of each PATH directory decides. On Windows, a PATH directory with a `node_modules` directory in it is a candidate; elsewhere, a PATH directory named `bin` with `../lib/node_modules`.
- A candidate is a prefix only when some package in it has a command in its bin directory that runs a file inside the package: `<bin>.cmd` read as an npm launcher on Windows, `<bin>` as a link elsewhere. Programs leave a `node_modules` in places such as `C:\Windows\System32`, and that alone is not enough.
- Commands are looked up by the names in each package's `bin`: the bin directory is never listed, so no other program in it is reported.
- The same prefix reached through two PATH entries, such as fnm's per-shell link and the real directory, is listed once, by its real path.
- The first prefix in PATH is the one `npm install -g` writes to. Its packages have ids by name; the packages of the others have ids by path (architecture.md §5), because the same package can be in two prefixes.

## Evidence used

- `fact`: `node_modules/<name>/package.json` declares the installed version.
- `inference`: the directory is in PATH and has the layout of an npm global prefix.
- `inference`: a command in the bin directory runs a file inside the package, as npm writes them.
- `inference`: the package directory is a link, as `npm link` makes them.

"Installed by npm" is always an inference: `medium` with a command that runs the package, `low` without one (architecture.md §6).

## Version detection

The `version` of the package's own `package.json`. latest is never resolved: npm records no spec or tarball for a global package, so where it came from cannot be determined, and the origin rule (architecture.md §8) does not query it. A link made with `npm link` is not a package from a registry.

## Commands executed

None.

## Files inspected

The `node_modules` directory of each candidate, each package's `package.json`, and the commands their `bin` names in the bin directory: on Windows the `.cmd` launcher, read with the same templates as pnpm's (ADR 0009).

## Network requests

None.

## Failure modes

- A launcher that runs a file that does not exist gives a `warning` that the command cannot start, with the package's id. That is what an interrupted update of Claude Code can leave behind.
- A `package.json` that cannot be read or has no valid version leaves the installed version unknown.

## Security considerations

npm is never run, so a prefix's configuration cannot run code. Nothing about global packages leaves the machine. A package name comes from a directory name and is shown escaped like any other text.

## Known limitations

- A prefix whose commands are not in PATH is not found, and neither is a package without commands in a prefix where no package has one.
- On Linux and macOS, npm writes links; a link whose target is missing reads as no command at all, so a broken command is only reported on Windows.
- latest is never known.
