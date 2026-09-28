# Git

## Purpose

Read repository metadata for projects, and detect repositories used as tools.

## Detection strategy

A repository found under `scan.paths` is a project. It is a tool only when it is declared in `[[tools.git]]` (fact) or an executable in a scanned bin directory resolves inside it (inference). See docs/mvp.md §5.3.

## Evidence used

| Claim | Evidence | Kind |
|---|---|---|
| installed version | highest semver tag on `HEAD` | fact |
| installed by git | declared in config / executable resolves inside the repository | fact / inference |
| source | remote `origin` points to github.com/owner/repo | fact |

Without a semver tag on `HEAD`, the version is unknown. The evidence records the commit and the distance to the last reachable tag.

## Version detection

`git tag --points-at HEAD`, then `git describe --tags --long HEAD` when there is no tag.

## Commands executed

Only those two, with a hardened environment: `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL` set to the null device, `-c core.fsmonitor=false`, `GIT_PAGER=cat`, `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, and no `GIT_*` variable from the caller.

## Files inspected

`.git` (or the `gitdir:` file of a worktree), `HEAD`, `commondir`, loose refs, `packed-refs`, `config`.

## Network requests

None. See github.md.

## Failure modes

A declared tool that is not a repository becomes an error record with a diagnostic. A `.git` file that cannot be read skips that repository with a warning; the rest of the run continues. git failing on a repository, for example refusing it (`safe.directory`) or timing out, in either command, makes the tool an error record with a diagnostic. Only git saying it found no tag leaves the version unknown without an error.

## Security considerations

Repositories found on disk are untrusted. Metadata is read from files, and git runs only where reading files would mean parsing packfiles. The security tests show that the hardening stops a command planted in `core.fsmonitor`.

## Known limitations

Requires Git 2.32 or later. Only the `origin` remote, or else the first remote, is used for the source.
