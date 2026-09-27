# 0007: JSON as a public interface

Status: accepted

## Context

IDE extensions and scripts will consume actually. They must not re-implement detection.

## Decision

`--json` is a versioned contract (`schemaVersion`). It is a projection of the domain model. Claims are never omitted, `null` never means missing information, and `diagnostics` is always present. stdout carries only the JSON document. Everything else goes to stderr.

## Consequences

Incompatible changes require a new `schemaVersion`.
