# Contributing

## Setup

```bash
pnpm install        # also installs the git hooks
pnpm build
node dist/cli/index.js status
```

Development is supported on Linux, macOS and Windows. Tests write paths as `p("/home/me/x")` (`tests/helpers/fakes.ts`), which gives the platform's own form. On Windows, five tests create symlinks, which take Developer Mode or an administrator; without them those tests fail with `EPERM`. `.gitattributes` keeps every file LF in any clone, except the real Windows launchers in `tests/fixtures/windows/`.

## Checks

| Command                                                 | Runs                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm check`                                            | lint, format check, typecheck and every test (pre-push hook)             |
| `pnpm test:unit`                                        | domain rules, providers with fakes, config and output                    |
| `pnpm test:integration`                                 | inventory with fake infrastructure, CLI exit codes and JSON              |
| `pnpm test:security`                                    | allowlist, hardened git against a hostile repository, tokens, HTTP hosts |
| `pnpm test:architecture`                                | layer boundaries (RA-001…RA-006, RA-010)                                 |
| `pnpm vitest run tests/unit/core.test.ts -t "mayBreak"` | a single test                                                            |

CI runs the same checks, then `pnpm build`, a smoke run of the compiled CLI (`status --offline --json` and an invalid flag) and `pnpm audit --prod`, and blocks merges when any of them fails.

## Architecture in one paragraph

`cli → application → core ← providers ← infrastructure`. `core` is pure. Only `src/infrastructure` touches the outside world, and `src/composition.ts` is the only place that wires it in. Providers and scanners receive ports (`src/core/ports.ts`). The planning documents in `docs/` are in Spanish and explain every decision. Start with `docs/architecture.md`.

## Rules that are not negotiable

- Read-only. No command that installs, updates, removes or writes outside actually's own cache and state directories.
- Processes only through the CommandRunner allowlist (`src/infrastructure/command-runner/allowlist.ts`). A new command needs an ADR in `docs/decisions/`.
- Network only through `src/infrastructure/http/`, to allowlisted hosts.
- Never guess. If a value cannot be supported by evidence, it is `unknown` with a reason.
- No telemetry.

## Adding a provider

A provider is not merged without (docs/mvp.md §10):

1. tests;
2. a page in `docs/providers/` following the template in `docs/design.md` §17, covering detection strategy, evidence, commands executed, files inspected, network requests, failure modes, security considerations and known limitations.
