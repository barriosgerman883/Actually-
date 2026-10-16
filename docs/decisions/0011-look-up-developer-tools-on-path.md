# 0011: Look up a closed list of developer tools on PATH

Status: accepted

## Context

actually scans only pnpm's bin directory, `~/.local/bin` and `scan.bin_paths` for executables (open-questions.md #14). Listing every directory in PATH would turn the thousands of programs of an operating system into "unknown executables" and say nothing useful about them. So tools that people use every day, such as git or node, never appeared: on Windows, git is in `C:\Program Files\Git\cmd`, outside those directories.

actually runs a closed list of seven commands and never the programs it finds (0005). Running `git --version` would answer the version, but it would mean running whatever binary comes first in PATH, and adding a command per tool.

## Decision

- actually looks up a closed list of developer tools by name, where the shell would find them: the first match in PATH, with the PATHEXT extensions on Windows. It asks for those files only. It never lists a PATH directory and never runs what it finds. The list is in `src/providers/path/tools.ts` and docs/providers/path.md.
- The version comes from a file that states it, when there is one: `node_version.h`, Go's `VERSION`, Java's `release`, the release notes of Git for Windows, or the version directory of a version manager. Otherwise it stays unknown, with the reason that actually does not run the tool.
- Latest stays unknown. Each tool defines "latest" in its own way, for example node's Current and LTS lines, and a wrong source would give a false conclusion.
- A tool that a package or a repository already accounts for is not listed again, and the one on PATH stands for an unknown executable with the same name.
- On Windows, an app execution alias of the Microsoft Store is never reported as an installed tool.

## Consequences

- The seven commands stay the same, and nothing found on PATH is run.
- For most tools the version stays unknown. A file read in place of running the tool is weaker evidence: a version directory or a release notes heading is an inference, and a planted file can change it (threat-model.md).
- The list and its version sources have to be maintained by hand.
- A tool whose directory is not in PATH, or that is reached only through a shell function or an alias, is not found.
