# 0010: Serve the CLI to agents as an MCP server over stdio

Status: accepted

## Context

Agents can already use actually through the CLI, as `skills/actually/SKILL.md` describes. That works only where the agent has a shell, and it gives the model a whole command line. The Model Context Protocol lets a client launch a server and call a fixed set of tools with validated arguments. Clients without a shell, such as desktop chat apps, use it too.

Phase 3 (prd.md §13) asks integrations to consume the core or the structured output, never to duplicate detection.

The official TypeScript SDK, `@modelcontextprotocol/sdk` 1.32.1, has 17 direct dependencies, among them express, hono, jose, ajv, zod and cross-spawn, most of them for HTTP transports and authorization. They would be installed for every user of the CLI, against 4 runtime dependencies today.

The protocol changed its lifecycle in 2026-07-28. Earlier versions (2025-11-25 and before) open with an `initialize` handshake. 2026-07-28 drops the handshake: every request carries its version in `_meta`, and the server answers `server/discover`. Clients of both kinds are in use.

## Decision

- `actually mcp` runs a server over stdio only: one JSON-RPC message per line on stdin and stdout, logs on stderr. It opens no socket.
- The protocol is implemented in `src/mcp/`, without the SDK. It covers tools only, for both generations:
  - `initialize` and `ping` (2025-11-25 and 2025-06-18);
  - `server/discover` and the per-request version in `_meta` (2026-07-28);
  - `tools/list` and `tools/call`.
- Two tools, `status` and `explain`. Each call becomes CLI arguments and runs through `run()` with `--json`, so the result is the same document `status --json` and `explain --json` print (design.md §14). The target goes after `--`, so it can never be read as a flag.
- Calls run offline unless they pass `offline: false`, the same policy the skill gives agents. `actually mcp --offline` keeps every call offline, and `[network] enabled = false` still applies.
- Results are text, never `structuredContent`. Every invisible or control character is written as a `\u` escape, which keeps the JSON value and shows the model what a terminal would hide (F-73).
- There is no argument for a path. The project inspected is the one in the directory the client starts the server in, as with the CLI.
- Calls run one at a time. A cancelled call gets no response.

## Consequences

- Runtime dependencies stay at 4, and the lockfile does not change.
- Following the protocol is our job. Each new revision has to be read and its changes implemented by hand. 2026-07-28 remade the lifecycle, and later revisions may change as much.
- The tool names and their input schemas become a public interface, like the JSON (0007).
- What a call returns goes into the model's context, and from there to whoever runs the model. That includes paths, project names and installed versions, which actually never sends to npm or GitHub (architecture.md §8). Connecting the server is the user's decision; the docs say so.
- Values come from files and network responses. A package name or a tag can carry text written for the model. The tool descriptions and the server's instructions say these values are data. That reduces the risk of prompt injection but does not remove it.
- In Claude Code, the skill and the server do almost the same thing. The server adds clients without a shell and a narrower surface.
