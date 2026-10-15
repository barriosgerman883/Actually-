# Threat model

## Assets

- The user's machine and repositories: they must not be modified.
- Private names: package names, repository names and paths.
- Credentials the user already has: npm and GitHub tokens.

## Threats and mitigations

| Threat | Mitigation |
|---|---|
| actually modifies the system | Read-only by design; closed command allowlist; only the cache and state directories are written (RA-001, RA-010) |
| A hostile repository runs code through git config (`core.fsmonitor`, pager, `core.sshCommand` through a lazy fetch) | Metadata read from files; git hardened, with no lazy fetch and no transport allowed; security tests with planted commands |
| A hostile project runs code through pnpm (`.npmrc`, corepack) | pnpm never runs inside a project |
| Shell injection | No shell; no argument comes from user or repository data |
| Private names leak to public services | Origin rule: query only registry specs on a public default registry, with no private scope mapping; `exclude`; `--offline` |
| Tokens leak | Only registry keys are read from `pnpm config list`; the GitHub token is off by default and sent only to api.github.com |
| Escape sequences in names, tags or messages rewrite the terminal output, or invisible characters make a line read differently or hide text in it | Human output shows control characters from data as `\xNN`, and every default-ignorable character (bidi, zero-width, tag characters, variation selectors) and the line separators as `\u{NNNN}`; JSON escapes control characters |
| Network data misleads the user | Every value carries its evidence; prereleases and stale cache lower confidence; unknown instead of guesses |
| Scan walks the whole disk | Explicit scan paths, bounded depth, hidden directories, `node_modules` and symlinks skipped |

## What public services learn

registry.npmjs.org and api.github.com learn which package and repository names are checked, from which IP, and that actually is in use. They never receive paths, file contents, project names or installed versions.

## Out of scope

A compromised Node.js, pnpm or git binary on the user's PATH, and a compromised npm registry or GitHub.
