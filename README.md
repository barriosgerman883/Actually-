# actually?

Know what is on your machine, and why.

`actually` is a local-first, read-only CLI. It inventories your developer tools, repositories and dependencies, compares installed and latest versions, and explains every conclusion with evidence. It never installs, updates or removes anything.

```bash
pnpm add -g @getactually/cli
actually status
```

```text
actually

GLOBAL

↑ gstack  update available (major, may break)
  installed    1.0.0
  latest       2.0.0
  installed by pnpm
  confidence   high

PROJECT · ~/projects/app
  manager      pnpm
  repository   https://github.com/me/app
  dependencies 47 checked · 3 updates available
```

## Commands

| Command                     | What it shows                                             |
| --------------------------- | --------------------------------------------------------- |
| `actually status`           | Global tools, the current project and configured projects |
| `actually status --global`  | Global tools only                                         |
| `actually status --project` | The current project only                                  |
| `actually status <tool>`    | Detail of one tool                                        |
| `actually explain <tool>`   | Every fact and inference behind each conclusion           |

Options: `--json`, `--offline`, `--no-cache`, `--exit-code`, `--verbose`, `--no-color`, `--debug`.

A name that matches several tools, such as the same dependency in two projects, is ambiguous. `actually` then lists the ids to pass instead of guessing.

## What it detects

- **pnpm global packages:** installed version, whether pnpm manages them, latest version on npm.
- **Executables** in pnpm's global bin directory, `~/.local/bin` and directories you configure. Executables no supported provider manages are reported as unknown, never guessed.
- **Projects:** declared (`package.json`), resolved (`pnpm-lock.yaml`, `package-lock.json`) and installed (`node_modules`) versions of each dependency.
- **Git repositories:** a repository is a project unless you declare it as a tool, or an executable in a scanned directory resolves inside it. A tool's version is the semver tag on `HEAD`. Its latest version is the latest GitHub release, or else the highest semver tag.

Every value is either known, with a confidence level and evidence, unknown with a reason, or not applicable. `actually` does not fill gaps with guesses.

"Latest" means what the source declares: npm's `latest` dist-tag, chosen by the publisher, or the latest non-prerelease GitHub release. It is not an independent guarantee of stability.

## What leaves your machine

`actually` has no server and collects nothing. To know the latest version of something, it asks:

| Host                 | Receives                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `registry.npmjs.org` | the name of each package checked, your IP, `actually/<version>`  |
| `api.github.com`     | `owner/repo` of each repository checked, your IP, the user agent |

It never sends file paths, file contents, project names or installed versions. Those services can still see which names were checked.

A package is only checked on the public registry when its origin is known to be public: it was declared with a registry spec, it is not a package of the same workspace and the lockfile does not resolve it locally, and none of your pnpm config, `.npmrc`, `.yarnrc` or `.yarnrc.yml` files sets another registry for it. Otherwise its latest version is reported as unknown. The first run that uses the network prints a notice on stderr explaining this.

Use `--offline` to send nothing, or set `[network] enabled = false`.

## Configuration

Optional. Without it, `actually` checks global tools and the project in the current directory.

The file is `~/.config/actually/config.toml`. `$XDG_CONFIG_HOME` is honored, Windows uses `%APPDATA%\actually\config.toml`, and `ACTUALLY_CONFIG` overrides the path.

```toml
[scan]
paths = ["~/projects", "~/tools"]   # projects to check; never the whole disk
bin_paths = []                      # extra executable directories
depth = 3                           # how deep to look under each path

[[tools.git]]
path = "~/tools/gstack"             # a repository that is a tool, not a project

[network]
enabled = true
exclude = ["@my-company/*"]         # names never sent anywhere
github_token = false                # use GITHUB_TOKEN only to raise the rate limit

[cache]
enabled = true
ttl = "6h"

[output]
color = "auto"                      # "auto", "always" or "never"; NO_COLOR is respected
```

## JSON and exit codes

`--json` prints a versioned document (`schemaVersion: 1`) on stdout and nothing else. Notices and diagnostics go to stderr. `explain --json` includes the evidence.

| Code | Meaning                                                    |
| ---- | ---------------------------------------------------------- |
| 0    | Completed, even if some data is unknown                    |
| 1    | Updates are available (only with `--exit-code`)            |
| 2    | Invalid usage, or a tool name that is missing or ambiguous |
| 3    | Fatal error, such as an invalid config file                |

## Requirements and limits

- Node.js 22.19 or later, pnpm, and Git 2.32 or later for repository tools.
- Linux and macOS. Windows is not supported yet.
- Yarn and Bun lockfiles are detected but not read yet.
- Global packages are those of the pnpm that runs outside any project. A project whose `packageManager` pins another pnpm major keeps its own global packages elsewhere, and those are not listed; a warning says so when that project is checked.

## Found something wrong?

That is the most useful feedback. Open an issue with the "actually was wrong" template and include the output of `actually explain <tool>`.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0
