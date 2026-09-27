# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

`actually?` is a local-first, read-only CLI that inventories developer tools, repositories and dependencies. It compares installed and latest versions and explains every conclusion with evidence. The npm package is `@getactually/cli` and the command is `actually`.

The MVP scope in `docs/prd.md` §13–14 is implemented, and open findings are listed in `docs/review/findings.md`: pnpm global packages, executables in allowed directories, Git repositories used as tools, projects (package.json, pnpm and npm lockfiles, node_modules), npm registry and GitHub resolvers, response cache, `status`, `status <tool>`, `explain`, `--json`.

## Commands

```bash
pnpm install                 # also installs git hooks (pre-commit, pre-push)
pnpm build                   # tsc → dist/, entry dist/cli/index.js
pnpm check                   # lint + format:check + typecheck + all tests (pre-push)
pnpm test:unit | test:integration | test:security | test:architecture
pnpm vitest run tests/unit/core.test.ts -t "mayBreak"   # a single test
node dist/cli/index.js status --global                  # run locally
```

To try it against real global packages without touching the system, point `PNPM_HOME` and `XDG_{STATE,CACHE,CONFIG}_HOME` at temporary directories.

## Code layout

`src/core` holds the domain model, confidence rules, status derivation and ports (interfaces). `src/infrastructure` holds the only code with I/O. `src/composition.ts` is the only module that wires infrastructure into the application, and `src/cli` imports that, never infrastructure directly. `src/application/inventory.ts` orchestrates providers (`src/providers/*`) and scanners into an `Inventory`. `tests/helpers/fakes.ts` provides in-memory implementations of every port.

## Where decisions live

Each concept is defined in exactly one section. Other documents refer to it as `file.md §N` instead of repeating it. To change a concept, edit its canonical section and check the references. Do not add a second definition.

| Concept | Canonical section |
|---|---|
| Domain model: `ToolRecord`, `Claim<T>`, status derivation, `updateType`/`mayBreak`, meaning of `latest`, id format | `docs/architecture.md` §5 |
| Confidence rules | `docs/architecture.md` §6 |
| CommandRunner allowlist, pnpm and git execution rules | `docs/architecture.md` §7 |
| What leaves the machine, which packages may be queried | `docs/architecture.md` §8 |
| Layer rules RA-001…RA-010 | `docs/architecture.md` §12 |
| Exit codes | `docs/architecture.md` §3.1 |
| Diagnostics | `docs/architecture.md` §13 |
| Response cache | `docs/architecture.md` §14 |
| Cache and LocalState directories | `docs/architecture.md` §3.5 |
| Human output formats | `docs/design.md` §5, §8, §9 |
| First-run network notice | `docs/design.md` §12 |
| Config file | `docs/design.md` §13 |
| JSON contract | `docs/design.md` §14 |
| Git repo: project or tool | `docs/mvp.md` §5.3 |
| Scope, phases, v0.1 | `docs/mvp.md`, `docs/prd.md` §13 |
| Agent guardrails and the findings protocol | `docs/mvp.md` §9 (Agentes) |

`docs/review/open-questions.md` records every resolved decision and the commit that applied it. `docs/review/2026-09-cross-review.md` is a snapshot that cites the original versions of the documents. Do not update it to match the current text.

## When you find a problem

The docs are the source of truth. If you find a bug, a failing check outside your task, or a difference between the code and the docs:

1. Do not modify code, tests or docs to fix it, and do not work around it.
2. Record it in `docs/review/findings.md` with the template there.
3. Tell the user: the id, the location, the impact and a proposed fix.

Fix a finding only when the user asks for it by id. If the user decides the code is right, update the canonical doc section instead and close the finding that way. A failure introduced by your own change in progress is not a finding: fixing it is part of that change.

## Agent guardrails

`.claude/settings.json` runs two `PreToolUse` hooks. `.claude/hooks/guard-bash.mjs` denies destructive or irreversible shell commands and asks before risky ones, including any inline code such as `node -e` or `python -c`. `.claude/hooks/guard-edit.mjs` protects the guardrails themselves, `pnpm-lock.yaml`, `.git/` and the review snapshot, and rejects `.skip(`, `.only(`, `@ts-ignore` and `eslint-disable`. Do not try to get around a denial: tell the user what you needed and why. Only the user changes these files.

**Never modify what is protected, even with authorization.** If a guardrail or a session permission check blocks a change, do not ask for permission and do not use an authorization to make it. Report the problem or error (location, impact, proposed fix) and record it as a finding when you can. The user applies the change.

## Architecture invariants

These rules span several documents. Code must follow them from the first commit.

- **Layers.** Dependencies point `cli → application → core ← providers ← infrastructure`. `core` performs no I/O. Providers never print output, and the CLI never detects anything.
- **Infrastructure is the only way out.** `filesystem` only reads. `command-runner` is the only code that spawns processes. `http` is the only code that uses the network. `cache` and `local-state` are the only code that writes to disk, each only inside its own directory. Architecture tests in CI enforce this.
- **CommandRunner.** Callers pick a command by id from a closed list of exact commands. There are 7 today. Callers never pass a binary, arguments or environment. Adding a command requires an ADR.
- **pnpm.** pnpm never runs inside a detected project, because a project's `.npmrc` or corepack could run code. It runs from an empty directory inside local state (`src/infrastructure/local-state`). Project dependencies are read from files.
- **Tokens in pnpm config.** The output of `pnpm config list --json` can contain auth tokens. Keep only `registry` and `@scope:registry`. Never log or store the rest.
- **git.** git runs only for tags and distance to the last tag, with a hardened environment. `HEAD`, refs and remotes are read from files.
- **Claims.** Every inferred value is a `Claim<T>` in one of three states: `known`, `unknown` with a reason, or `not-applicable`. Each claim has its own confidence and its own evidence, typed as `fact` or `inference`. If a value cannot be supported, it is `unknown`. Never fill it in.
- **Meaning of latest.** `latest` is what the source declares as the latest stable version. For npm, that is the `latest` dist-tag chosen by the publisher. It is not a stability guarantee.
- **Registry queries.** A package is queried on `registry.npmjs.org` only if all three hold:
  - its spec is a registry spec;
  - the effective default registry is the public one;
  - its scope is not mapped to another registry.

  If any of these cannot be determined, do not query, and leave `latest` as `unknown`.
- **GitHub token.** It is off by default, because it lets GitHub link queries to an account.
- **stdout and stderr.** stdout carries only the result. The first-run notice and all other messages go to stderr, including with `--json`.
- **JSON contract.** Every document has `schemaVersion`. Claims are never omitted, and `null` never stands for missing information. `diagnostics` is always present.
- **Exit codes.** `0` means the run completed. `1` means updates are available, only with `--exit-code`. `2` means invalid usage. `3` means a fatal error.

## Conventions

- **Language.** English for code, comments, CLI output, JSON keys, README, CONTRIBUTING, AGENTS.md and the planned `docs/` subtrees. Spanish for the planning documents (`docs/mvp.md`, `docs/prd.md`, `docs/architecture.md`, `docs/design.md`) and `docs/review/` until public launch.
- **npm name.** The unscoped name `actually` and the scope `@actually` belong to other npm accounts. Do not use them.
- **Doc changes.** Make one commit per decision. `docs/review/open-questions.md` cites commits by short hash. If a rebase rewrites those commits, update the cited hashes and check that each one resolves.
- **Branches.** PRs are merged with merge commits. If a branch's PR is already merged, restart the branch from `main` before doing new work on it. Do not stack new commits on top of merged history.
