# AGENTS.md

Instructions for coding agents working in this repository. They do not replace the automated checks in `pnpm check`, which enforce most of them.

- Never add destructive commands.
- Never bypass the CommandRunner.
- Never add a command to the CommandRunner allowlist without an ADR.
- Never run pnpm inside a detected project.
- Never access the network outside `src/infrastructure/http/`.
- Never import `node:fs` outside `src/infrastructure/{filesystem,cache,local-state}`.
- Never write to disk outside the cache and local state directories.
- Never log or store the output of `pnpm config list`: it can contain tokens.
- Never report a value without evidence. Use an `unknown` claim with a reason.
- Never introduce telemetry.
- Never require elevated privileges.
- Every provider requires tests and a page in `docs/providers/`.
- Security exceptions require an ADR.

When you find a bug, a failing check outside your task, or a difference between the code and the docs, do not fix it or work around it. The docs are the source of truth. Record it in `docs/review/findings.md` and tell the user. Fix a finding only when the user asks for it by id. A failure your own change introduced is part of that change.

The hooks in `.claude/` block destructive shell commands and edits that would weaken the checks. Do not try to get around them. See `docs/mvp.md` §9.

Run `pnpm check` before pushing. See `CLAUDE.md` for where each decision is documented.
