# Changelog

## 0.3.0

- Add `actually mcp`, an MCP server over stdio with the tools `status` and `explain`, for agents such as Claude Code and Codex. They return the same documents as `--json`, run offline unless a call asks for the network, and escape invisible characters before the model reads them. No new dependencies. See [docs/commands/mcp.md](docs/commands/mcp.md).
- Human output escapes every invisible character, including Unicode tag characters and variation selectors (F-73).
- Read each file through a single descriptor, with the size limit kept while reading, so a file swapped after it was checked is never read (F-70).
- Build the environment of pnpm and git from a dictionary without a prototype, so variable names such as `__proto__` stay data (F-69).

## 0.2.1

- Use `npm install -g @actually-cli/cli` as the only documented installation method. This replaces the pnpm installation instructions; inventory behavior is unchanged.
