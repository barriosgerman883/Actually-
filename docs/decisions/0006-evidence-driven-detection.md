# 0006: Evidence-driven detection

Status: accepted

## Context

Guessing how a tool was installed, or what its latest version is, produces confident wrong answers.

## Decision

Every inferred value is a claim that is known, unknown with a reason, or not applicable. Known claims carry their own confidence and evidence typed as fact or inference. Confidence follows fixed rules (docs/concepts/confidence.md). Anything that cannot be supported is reported as unknown.

## Consequences

`explain` can show the reasoning for every value. Output is sometimes less complete, and that is intended.
