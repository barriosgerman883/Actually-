# Changelog

## Unreleased

- Add `actually mcp`, an MCP server over stdio with the tools `status` and `explain`. They return the same documents as `--json`, run offline unless a call asks for the network, and escape invisible characters before the model reads them. No new dependencies.
- Human output escapes every invisible character, including Unicode tag characters and variation selectors (F-73).

## 0.2.1

- Use `npm install -g @actually-cli/cli` as the only documented installation method. This replaces the pnpm installation instructions; inventory behavior is unchanged.
