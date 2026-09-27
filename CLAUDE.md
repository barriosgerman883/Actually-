# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

`actually?` is a planned local-first, read-only CLI that inventories developer tools, repositories and dependencies. It compares installed and latest versions and explains every conclusion with evidence. The npm package is `@getactually/cli` and the command is `actually`.

The repository currently holds planning documents only. There is no source code, no `package.json`, and no build, lint or test command yet. Do not invent commands. The planned local gate is `pnpm check` (lint, typecheck, tests, security tests, architecture tests); see `docs/design.md` §19–20.

The next milestone is v0.1, "Primera versión refutable", in `docs/prd.md` §13. Its scope is `status --global` for pnpm global packages against the npm registry, plus `explain`, `--json`, the first-run network notice and `--offline`. v0.1 has no Git, GitHub, projects, cache or config file.

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

`docs/review/open-questions.md` records every resolved decision and the commit that applied it. `docs/review/2026-09-cross-review.md` is a snapshot that cites the original versions of the documents. Do not update it to match the current text.

## Architecture invariants

These rules span several documents. Code must follow them from the first commit.

- **Layers.** Dependencies point `cli → application → core ← providers ← infrastructure`. `core` performs no I/O. Providers never print output, and the CLI never detects anything.
- **Infrastructure is the only way out.** `filesystem` only reads. `command-runner` is the only code that spawns processes. `http` is the only code that uses the network. `cache` and `local-state` are the only code that writes to disk, each only inside its own directory. Architecture tests in CI enforce this.
- **CommandRunner.** Callers pick a command by id from a closed list of exact commands. There are 8 today. Callers never pass a binary, arguments or environment. Adding a command requires an ADR.
- **pnpm.** pnpm never runs inside a detected project, because a project's `.npmrc` or corepack could run code. It runs from an empty directory inside local state. Project dependencies are read from files.
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
