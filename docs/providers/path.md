# Developer tools on PATH

## Purpose

Report developer tools that no package manager provider covers, such as git or node, where the shell would find them (ADR 0011).

## Detection strategy

- A closed list of names, in `src/providers/path/tools.ts`: git, node, go, java, python, python3, deno, bun, docker, gh, rustc and cargo. npm and pnpm are not in it: their own providers report them.
- Each name is looked up in PATH in order, with each PATHEXT extension on Windows, as cmd does; the first match wins. Only absolute PATH entries are used, never the current directory. No PATH directory is ever listed.
- A tool that a pnpm or npm package, or a repository used as a tool, already accounts for is not listed again.
- The tool found on PATH stands for an unknown executable with the same name in pnpm's bin directory, `~/.local/bin` or `scan.bin_paths`. That executable becomes evidence for the tool, not a second record with the same id.

## Evidence used

- `fact`: the file is the first match for the name in PATH.
- For the version, see the table below.

## Version detection

Nothing is run. The version is read from a file that states it, when there is one:

| Tool | Source | Evidence |
|---|---|---|
| node | `include/node/node_version.h` next to the binary, in the official archives for Linux and macOS | fact |
| node | otherwise, a directory named after the version in its path, as fnm, nvm, nvm-windows and Volta lay them out | inference |
| git | the `ReleaseNotes.html` that Git for Windows installs, headed by its version | inference |
| go | `VERSION` at the root of the distribution | fact |
| java | `release` at the root of the JDK or JRE, `JAVA_VERSION` | fact |
| the others | none | unknown |

latest is never resolved (ADR 0011).

## Commands executed

None.

## Files inspected

The candidate files of each name in each PATH directory, and the version files in the table, only near the binary that was found.

## Network requests

None.

## Failure modes

- No file that states the version: installed is unknown, with the reason that actually does not run the tool.
- On Windows, a file in `%LOCALAPPDATA%\Microsoft\WindowsApps` is an app execution alias. One such as `python.exe` may only open the Microsoft Store, so it is reported with its version unknown and that reason, never as an installed tool.

## Security considerations

What is found is never run, so a binary planted in PATH cannot run code through actually. A version file can be planted next to a binary, so every version shows its source, and the ones that are not authoritative are inferences.

## Known limitations

- Only the tools on the list. A tool reached through a shell function or an alias, or whose directory is not in PATH, is not found.
- How each tool was installed, and its latest version, are not determined.
- git's version is known only for Git for Windows, and node's only from the official archives or a version manager's layout.
