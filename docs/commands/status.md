# status

`actually status [--global | --project] [<tool>]`

Without options: global tools, the project in the current directory, and projects under `scan.paths`. `--global` and `--project` restrict that. `--project` fails with exit code 2 outside a project.

The summary hides up-to-date project dependencies and executables no provider manages. `--verbose` lists them.

`actually status <tool>` shows one tool in detail. `<tool>` is a name or a full id. An ambiguous name exits with code 2 and lists the ids.

Options: `--json`, `--offline`, `--no-cache`, `--exit-code`, `--verbose`, `--no-color`, `--debug`.
