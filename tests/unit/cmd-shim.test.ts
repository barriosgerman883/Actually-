import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCmdShim } from "../../src/core/cmd-shim.js";

/**
 * Real launchers, copied byte for byte from Windows 11 (CRLF kept by
 * .gitattributes):
 * - pnpm-standalone-11: %LOCALAPPDATA%\pnpm\bin\pnpm.CMD of pnpm 11.22.0's own installer.
 * - pnpm-alias-pn: pn.CMD next to it.
 * - corepack-pnpm: pnpm.CMD that `corepack enable` writes beside node.exe (Corepack 0.34.6).
 * - pnpm-global-bin, pnpm-link-global: what `pnpm add -g semver` and
 *   `pnpm link --global <dir>` write with pnpm 11.22.0; NODE_PATH points at
 *   a neutral path instead of the original temporary one.
 * - npm-exe-target, npm-node-target: what npm 12.2.0 writes for
 *   @anthropic-ai/claude-code and @openai/codex.
 */
const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "fixtures", "windows", name), "utf8");

describe("parseCmdShim on real launchers", () => {
  const cases: [string, ReturnType<typeof parseCmdShim>][] = [
    [
      "pnpm-standalone-11.cmd",
      {
        kind: "exe",
        path: "..\\global\\v11\\933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974\\node_modules\\@pnpm\\exe\\pnpm.exe",
      },
    ],
    ["corepack-pnpm.cmd", { kind: "node", script: "node_modules\\corepack\\dist\\pnpm.js" }],
    [
      "pnpm-global-bin.cmd",
      {
        kind: "node",
        script:
          "..\\global\\v11\\a2a1f1211273b5268cd42562523a0ae1a7df6e32629e15d2d8088e46fe876b0c\\node_modules\\semver\\bin\\semver.js",
      },
    ],
    ["pnpm-link-global.cmd", { kind: "node", script: "..\\..\\..\\repo-tool\\cli.js" }],
    [
      "npm-exe-target.cmd",
      { kind: "exe", path: "node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" },
    ],
    [
      "npm-node-target.cmd",
      { kind: "node", script: "node_modules\\@openai\\codex\\bin\\codex.js" },
    ],
    // Runs `pnpm` by name: following it would mean resolving PATH as cmd does.
    ["pnpm-alias-pn.cmd", undefined],
  ];

  it.each(cases)("%s", (name, expected) => {
    const text = fixture(name);
    expect(parseCmdShim(text)).toEqual(expected);
    // The same launcher with LF endings, as a checkout could leave it.
    expect(parseCmdShim(text.replace(/\r\n/g, "\n"))).toEqual(expected);
  });
});

describe("parseCmdShim rejects anything else", () => {
  const corepack = fixture("corepack-pnpm.cmd");
  const standalone = fixture("pnpm-standalone-11.cmd");
  const npmExe = fixture("npm-exe-target.cmd");

  it.each([
    [
      "an argument before the script",
      corepack.replace('"%~dp0\\node.exe"  "', '"%~dp0\\node.exe" --require x "'),
    ],
    [
      "branches that run different scripts",
      corepack.replace('node  "%~dp0\\node_modules', 'node  "%~dp0\\other'),
    ],
    ["another variable", standalone.replace("%~dp0\\..", "%PNPM_HOME%\\..")],
    ["a second command", `${standalone}del x\r\n`],
    ["a command after the target", standalone.replace('pnpm.exe"', 'pnpm.exe" & calc')],
    ["a target that is not an .exe", standalone.replace("pnpm.exe", "pnpm.cmd")],
    ["a drive after %~dp0", standalone.replace("%~dp0\\..", "%~dp0\\C:\\x")],
    ["a root path after %~dp0", standalone.replace("%~dp0\\..", "%~dp0\\\\..")],
    ["a script with an empty segment", npmExe.replace("bin\\claude.exe", "bin\\\\claude.exe")],
    ["an empty file", ""],
  ])("%s", (_, text) => {
    expect(parseCmdShim(text)).toBeUndefined();
  });
});
