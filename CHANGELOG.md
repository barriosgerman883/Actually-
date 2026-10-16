# Changelog

## 0.4.0

- The agent skill (`skills/actually/SKILL.md`) reads the text output and adds `--json` only when a program reads the result or needs a field the text leaves out. For the same values, the text is several times smaller, so it costs the agent fewer tokens. The MCP tools still return JSON.
- `status --global` lists the packages of every npm global prefix whose commands are in `PATH`, with their installed version, and warns when a command runs a file that no longer exists. Their latest version is not queried: npm records nowhere where a global package came from.
- It also lists developer tools found on `PATH`, such as git, node, go and java, with the version read from a file that states it. Nothing found is run (ADR 0011).
- The global packages that another pnpm generation installed, such as pnpm 10 next to pnpm 12, are listed from their files instead of a warning that they are hidden (F-57).
- The new sources can change a record's `id`: a command listed before as an unknown executable now carries the provider of the package that installed it (design.md §14).

## 0.3.0

- Add `actually mcp`, an MCP server over stdio with the tools `status` and `explain`, for agents such as Claude Code and Codex. They return the same documents as `--json`, run offline unless a call asks for the network, and escape invisible characters before the model reads them. No new dependencies. See [docs/commands/mcp.md](docs/commands/mcp.md).
- Human output escapes every invisible character, including Unicode tag characters and variation selectors (F-73).
- Read each file through a single descriptor, with the size limit kept while reading, so a file swapped after it was checked is never read (F-70).
- Build the environment of pnpm and git from a dictionary without a prototype, so variable names such as `__proto__` stay data (F-69).

## 0.2.1

- Use `npm install -g @actually-cli/cli` as the only documented installation method. This replaces the pnpm installation instructions; inventory behavior is unchanged.
