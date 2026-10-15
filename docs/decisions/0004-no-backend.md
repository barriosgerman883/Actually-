# 0004: No backend

Status: accepted

## Context

Users' environments contain private project names and paths.

## Decision

There is no actually server. Detection runs locally. The network is used only to read public metadata from registry.npmjs.org and api.github.com, and the docs state exactly what those hosts receive.

## Consequences

No telemetry, no accounts. Metrics come from public signals such as installs and issues.
