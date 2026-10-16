# mcp

`actually mcp [--offline] [--no-cache]`

Runs actually as an MCP server over stdio, so an agent can call it. The client starts the server, sends JSON-RPC messages on stdin, one per line, and reads the answers on stdout. The server logs to stderr and stops when stdin closes. It opens no network port.

The server is the CLI with a protocol in front: each call runs the same code as `--json` and returns the same document (design.md §14). The decision is in [ADR 0010](../decisions/0010-mcp-server-over-stdio.md).

## Tools

| Tool | Arguments | Same as |
|---|---|---|
| `status` | `tool` (optional), `scope`: `all`, `global` or `project` (optional), `offline` (default `true`) | `actually status [--global \| --project] [<tool>] --json` |
| `explain` | `tool`, `offline` (default `true`) | `actually explain <tool> --json` |

`tool` is a name or a full id. An ambiguous name, a name that matches nothing and an invalid argument all give a result with `isError: true` and the JSON document, whose diagnostic the model can act on, such as the ids to choose from. A name that matches nothing does not mean the tool is missing: actually looks only at pnpm global packages, pnpm's directory, `~/.local/bin`, Git repositories used as tools and the current project. The tool descriptions say so, because in a real session git was installed but outside those places.

The result is the JSON document as text. Invisible characters in it, such as bidi marks or Unicode tag characters, are written as `\u` escapes: the JSON value is the same, and the model sees what a terminal would hide.

## Network

Calls run offline unless they pass `offline: false`. The tool description tells the model to do that only when the user asks whether something is up to date or which version is the latest.

- `actually mcp --offline` keeps every call offline, whatever it asks.
- `[network] enabled = false` in the config file does the same.
- The first call that goes online returns the network notice (design.md §12) as a second block of text, so it reaches the conversation.

## What the client learns

Everything a call returns goes into the model's context, and from there to whoever runs the model: paths, project names and roots, installed and latest versions, and, for `explain`, the evidence. actually never sends these to npm or GitHub (architecture.md §8), but connecting the server hands them to the client. Values come from files and network responses, so they can carry text written for the model. The server tells the model to treat them as data; that reduces the risk of prompt injection, it does not remove it.

## Connecting a client

Claude Code:

```bash
claude mcp add actually -- actually mcp
```

Other clients take a server definition like this one:

```json
{
  "mcpServers": {
    "actually": { "command": "actually", "args": ["mcp"] }
  }
}
```

The project inspected is the one in the directory the client starts the server in. There is no argument for a path.

## Protocol

- Versions: `2026-07-28`, with requests that carry the version in `_meta` and `server/discover`; `2025-11-25` and `2025-06-18`, with the `initialize` handshake.
- Methods: `initialize`, `ping`, `server/discover`, `tools/list`, `tools/call`, and the `notifications/cancelled` notification. A cancelled call gets no response.
- Calls run one at a time. Batches and lines over 1 MiB are rejected.
