---
name: actually
description: Find out what is installed in this environment before guessing. Use when you need to know which developer tools, global packages, Git repositories used as tools or project dependencies exist, which version is installed, how it was installed, or whether an update is available. Runs the read-only `actually` CLI and reports its evidence.
---

# actually: what is on this machine

`actually` inventories developer tools and dependencies and explains every conclusion with evidence. It never installs, updates or removes tools. It may write its own response cache and local state.

Use it instead of guessing, and instead of probing with one `which`, `--version` or `ls` after another.

## When to use it

- Before you suggest installing something: it may already be there.
- Before you run a tool: check that it exists and which version you have.
- When the user asks what they have installed, or whether something is up to date.
- When an error suggests a missing or mismatched tool.

## Commands

Start offline. Offline, it still reports what is installed and its installed version, and it sends nothing over the network:

```bash
actually status --global --offline
actually status --project --offline
actually status <tool> --offline
actually explain <tool> --offline
```

- **`status --global`:** pnpm and npm global packages, developer tools on `PATH` such as git and node, executables in pnpm's directory and `~/.local/bin`, and Git repositories used as tools. A tool it does not list may still be installed somewhere it does not look.
- **`status --project`:** the project in the current directory and its dependencies. Run it from the project's directory.
- **`status <tool>`:** one tool, by name or id.
- **`explain <tool>`:** the same tool, with the evidence and the confidence behind each value.

Without `--verbose`, `status` only counts the dependencies that are up to date and groups the executables with no known provider. Add `--verbose` when the user asks what is installed rather than what is out of date.

Go online, without `--offline`, only when the user asks whether something is up to date or which version is the latest:

```bash
actually status
actually explain <tool>
```

Online, it sends package names to `registry.npmjs.org` and `owner/repo` names to `api.github.com`. It never sends paths, file contents or installed versions. The first online run prints a notice on stderr about this.

## Text or JSON

Read the text output. It carries the same values as the JSON and is several times smaller, and you pay for every token you read. In the text output, warnings and errors go to stderr: keep stderr and read them.

Add `--json` only when a program will read the output, or when you need what the text leaves out, such as installation paths and tool ids:

```bash
actually status --project --offline --json
```

If the `actually` MCP server is connected and you have no shell, call its `status` and `explain` tools. They return the JSON document and follow the same offline-first rule. Where you have a shell, the commands above cost fewer tokens.

## Reading the JSON

Every JSON response has `schemaVersion`, `tools` and `diagnostics`. `status --json` also has `projects`; `status <tool> --json` and `explain <tool> --json` omit it.

- **`tools[]`:** one record per tool or dependency, with `name`, `id`, `scope` (`global` or `project`) and `status`: `current`, `outdated`, `unknown`, `warning` or `error`.
- **`versions`:** `installed`, `latest`, `requested` and `resolved`. Each is a claim: `{ "state": "known", "value", "confidence" }`, `{ "state": "unknown", "reason" }` or `{ "state": "not-applicable" }`.
- **`installation`:** how it was installed, such as `pnpm`, `npm` or `git`, and where.
- **`update`:** what would update it.
- **`updateType` and `mayBreak`:** present only when `status` is `outdated`.
- **`evidence`:** only in `explain`. Each piece is a `fact` or an `inference`, with its source.
- **`diagnostics`:** problems found along the way. Read them.

## Rules

- **Report what it says, including `unknown`.** Never fill an unknown value with a guess. Give the reason instead: the text prints it in parentheses, the JSON in `reason`.
- **Offline, the status is `unknown`** unless an earlier online run cached the latest version. That says nothing about whether the tool is installed: look at the installed version.
- **Cite the confidence** when it is `medium` or `low`.
- **Do not update anything on your own.** If there are updates, list them and say which ones may break (`may break` in the text, `mayBreak` in the JSON). The user decides.
- **Know what it does not see:** system packages (apt, Homebrew), Python, Rust, Go and other ecosystems, and executables outside the directories above. For those, `command -v <name>` and `<name> --version` are still the way to check, and you should say that `actually` did not cover them.
- **Exit codes:** `0` means the run completed; `2` means invalid usage, such as a tool name that was not found, or one that matches several tools (the message lists their ids; pass one of them); `3` means a fatal error.

## If `actually` is not installed

If `command -v actually` finds nothing, tell the user, and fall back to checking tools one by one. Do not install it without asking.
