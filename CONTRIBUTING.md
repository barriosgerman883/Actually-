# Contributing

## Setup

```bash
pnpm install        # also installs the git hooks
pnpm build
node dist/cli/index.js status
```

Development is supported on Linux and macOS. On Windows, use WSL: the test doubles use POSIX paths and the hostile-repository tests run `sh`, so the checks, and therefore the git hooks, do not pass on native Windows. `.gitattributes` keeps every file LF in any clone.

## Checks

| Command                                                 | Runs                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm check`                                            | lint, format check, typecheck and every test (pre-push hook)             |
| `pnpm test:unit`                                        | domain rules, providers with fakes, config and output                    |
| `pnpm test:integration`                                 | inventory with fake infrastructure, CLI exit codes and JSON              |
| `pnpm test:security`                                    | allowlist, hardened git against a hostile repository, tokens, HTTP hosts |
| `pnpm test:architecture`                                | layer boundaries (RA-001…RA-010)                                         |
| `pnpm vitest run tests/unit/core.test.ts -t "mayBreak"` | a single test                                                            |

CI runs the same checks plus `pnpm audit --prod`, and blocks merges when any of them fails.

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
2. a page in `docs/providers/` following the template there, covering detection strategy, evidence, commands executed, files inspected, network requests, failure modes, security considerations and known limitations.
