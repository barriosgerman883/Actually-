# 0005: CommandRunner boundary

Status: accepted

## Context

Running `git` or `pnpm` inside an untrusted repository can execute code the repository defines, through `core.fsmonitor`, `.npmrc` or corepack.

## Decision

`src/infrastructure/command-runner` is the only code that spawns processes. Callers pick an id from a closed list of seven exact commands and cannot pass a binary, arguments or environment. pnpm always runs in an empty directory owned by actually. git runs with system and global config disabled, `core.fsmonitor=false`, no pager, no prompts, no optional locks, no lazy fetch of missing objects (`GIT_NO_LAZY_FETCH=1`) and no transport protocols (empty `GIT_ALLOW_PROTOCOL`). Nothing runs through a shell.

## Consequences

Adding a command requires a new ADR. The security tests check the exact table and prove the git hardening against a hostile repository.

The original list included `node --version`. No MVP provider uses it, so it was removed to keep the attack surface minimal.
