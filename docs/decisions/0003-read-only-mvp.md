# 0003: Read-only MVP

Status: accepted

## Context

A tool that inspects many repositories and global installs is dangerous if it can change them.

## Decision

The MVP only observes. It never installs, updates, removes, pulls, changes permissions or elevates privileges. The only writes are actually's own response cache and local state directories.

## Consequences

Enforced by the CommandRunner allowlist and by architecture tests RA-001 and RA-010. Any write feature needs a new ADR.
