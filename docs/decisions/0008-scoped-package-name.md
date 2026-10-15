# 0008: Scoped package name

Status: accepted

## Context

On npm, the unscoped name `actually` and the scope `@actually` belong to other accounts. The project first chose the scope `@getactually`, but access to the account that owns it was lost before anything was published there.

## Decision

Publish as `@actually-cli/cli`, from the npm organization `actually-cli`. The `bin` field keeps the command as `actually`. The scope reserves `@actually-cli/core` for future integrations.

## Consequences

Only the install line differs from the brand. Asking the current owner for the unscoped name remains possible later.
