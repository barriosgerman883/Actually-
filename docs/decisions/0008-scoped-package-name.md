# 0008: Scoped package name

Status: accepted

## Context

On npm, the unscoped name `actually` and the scope `@actually` belong to other accounts.

## Decision

Publish as `@getactually/cli`. The `bin` field keeps the command as `actually`. The scope reserves `@getactually/core` for future integrations.

## Consequences

Only the install line differs from the brand. Asking the current owner for the unscoped name remains possible later.
