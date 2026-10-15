# 0009: Run pnpm on Windows without a shell

Status: accepted

## Context

On Windows, pnpm is usually a `.cmd` launcher: pnpm's own installer, Corepack and `npm install -g` all write one. Since Node.js fixed CVE-2024-27980, `execFile` does not start a `.cmd` or `.bat` without `shell: true`, and actually never uses a shell (0005, architecture.md §7). Until 0.1.0, pnpm could not run on Windows at all.

These launchers are generated, and their text follows a few fixed templates. The one pnpm's installer writes is two lines, `@SETLOCAL` and `@"%~dp0\..\global\v11\…\@pnpm\exe\pnpm.exe" %*`.

## Decision

On Windows, actually finds `pnpm` itself:

- It searches each drive or UNC entry of `PATH`, in order, with the extensions of `PATHEXT` in order, as cmd does. It never searches the current directory or relative entries.
- An `.exe` or `.com` runs directly.
- A `.cmd` or `.bat` is read, never run. If its whole text matches one of the templates of cmd-shim (pnpm, Corepack) or npm, what it would start runs instead, with the same arguments:
  - the `.exe` it names;
  - or node with the script it names, using the `node.exe` beside the launcher, or else the first `node` in `PATH`, which must be an `.exe`.
- Any other launcher is not run, and pnpm is reported as failed.

git still runs as `git`: Git for Windows installs `git.exe`.

## Consequences

- No shell, and the allowlist does not change: the same seven commands, with the same arguments.
- Reading the launcher does not trust anything new. Whoever can write a launcher in a `PATH` directory can already put a `pnpm.exe` there. The target is a path relative to the launcher, with no variables other than the launcher's own directory and no shell operators. It is not an arbitrary executable chosen by a project or by user data.
- It differs from cmd in two ways:
  - a launcher's `NODE_PATH` is not set, which pnpm, a single bundled file, does not need;
  - PowerShell users may run `pnpm.ps1` instead, which only matters if it starts something different from the `.cmd` beside it.
- The templates have to follow cmd-shim and npm. A new template makes pnpm fail visibly, never silently: a diagnostic names the launcher.
- Only the launchers seen on Windows 11 are recognized: pnpm 11's installer, pnpm's global packages, Corepack 0.34 and npm 12. nvm-windows, Volta, Scoop and winget were not checked.
