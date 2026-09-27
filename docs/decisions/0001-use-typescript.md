# 0001: Use TypeScript

Status: accepted

## Context

actually is a CLI that parses untrusted JSON, YAML and TOML and must keep a strict domain model (claims, evidence, confidence) consistent across layers.

## Decision

TypeScript in strict mode with `noUncheckedIndexedAccess`, compiled to ES modules for Node.js 22.19 or later.

## Consequences

The domain model in `src/core/model.ts` is checked at compile time. Runtime validation is still needed for every external input.
