# 0002: Use pnpm

Status: accepted

## Context

The first supported ecosystem is pnpm, and the tool is installed with `pnpm add -g`.

## Decision

The repository uses pnpm, pinned through `packageManager` in `package.json`, and pnpm is the first installation provider.

## Consequences

Contributors need pnpm. Dependency build scripts are blocked by pnpm's default policy.
