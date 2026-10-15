import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { listExecutables } from "../../src/scanners/bin-scanner.js";
import { memoryFs } from "../helpers/fakes.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "fixtures", "windows", name), "utf8");

const home = resolve("/home/me");
const bin = join(home, "AppData", "Local", "pnpm", "bin");
const windows = { platform: "win32", pathext: ".COM;.EXE;.BAT;.CMD;.PS1" };

describe("listExecutables on Windows", () => {
  // What pnpm writes for `pnpm add -g semver` and `pnpm link --global`: an
  // sh script, a .CMD and a .ps1 for each command.
  const fs = memoryFs(
    {
      [join(bin, "semver")]: "#!/bin/sh",
      [join(bin, "semver.CMD")]: fixture("pnpm-global-bin.cmd"),
      [join(bin, "semver.ps1")]: "#!/usr/bin/env pwsh",
      [join(bin, "repo-tool.CMD")]: fixture("pnpm-link-global.cmd"),
      [join(bin, "repo-tool.ps1")]: "#!/usr/bin/env pwsh",
      [join(bin, "notes.txt")]: "",
    },
    {
      executables: [
        join(bin, "semver.CMD"),
        join(bin, "semver.ps1"),
        join(bin, "repo-tool.CMD"),
        join(bin, "repo-tool.ps1"),
        join(bin, "tool.cmd"),
        join(bin, "tool.EXE"),
      ],
    },
  );

  it("lists one command per name, without its extension, as cmd would run it", async () => {
    const found = await listExecutables(fs, [bin], windows);
    expect(found.map((e) => [e.name, e.path])).toEqual([
      ["repo-tool", join(bin, "repo-tool.CMD")],
      ["semver", join(bin, "semver.CMD")],
      // .EXE comes before .CMD in PATHEXT.
      ["tool", join(bin, "tool.EXE")],
    ]);
  });

  it("follows a .cmd launcher to what it runs, by reading it (ADR 0009)", async () => {
    const found = await listExecutables(fs, [bin], windows);
    expect(found.find((e) => e.name === "repo-tool")).toMatchObject({
      realPath: resolve(bin, "..", "..", "..", "repo-tool", "cli.js"),
      viaLauncher: true,
    });
    expect(found.find((e) => e.name === "tool")).toMatchObject({
      realPath: join(bin, "tool.EXE"),
      viaLauncher: false,
    });
  });

  it("gives the launcher's target by its real path, as repositories are compared (F-64)", async () => {
    const target = resolve(bin, "..", "..", "..", "repo-tool", "cli.js");
    const real = join(home, "Code", "repo-tool", "cli.js");
    const linked = memoryFs(
      { [join(bin, "repo-tool.CMD")]: fixture("pnpm-link-global.cmd") },
      { executables: [join(bin, "repo-tool.CMD")], symlinks: { [target]: real } },
    );
    const [found] = await listExecutables(linked, [bin], windows);
    expect(found).toMatchObject({ name: "repo-tool", realPath: real, viaLauncher: true });
  });

  it("keeps the first directory's command when another has the same name in any case", async () => {
    const other = join(home, ".local", "bin");
    const twoDirs = memoryFs({}, { executables: [join(other, "Tool.exe"), join(bin, "tool.cmd")] });
    const found = await listExecutables(twoDirs, [other, bin], windows);
    expect(found.map((e) => e.path)).toEqual([join(other, "Tool.exe")]);
  });

  it("keeps file names as they are on other platforms", async () => {
    const found = await listExecutables(fs, [bin], { platform: "linux" });
    expect(found.map((e) => e.name)).toContain("semver.CMD");
  });
});
