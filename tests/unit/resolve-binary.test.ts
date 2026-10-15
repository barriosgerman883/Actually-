import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWindowsCommand } from "../../src/infrastructure/command-runner/resolve-binary.js";
import { memoryFs } from "../helpers/fakes.js";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "..", "fixtures", "windows", name), "utf8");

const BIN = "C:\\Users\\U\\AppData\\Local\\pnpm\\bin";
const PNPM_EXE =
  "C:\\Users\\U\\AppData\\Local\\pnpm\\global\\v11\\933b1afb8467659abb23695dcb8cd7f3bad564cb27bb5c6843b75f41ac97b974\\node_modules\\@pnpm\\exe\\pnpm.exe";
const NODE_DIR = "C:\\Program Files\\nodejs";
const COREPACK_JS = `${NODE_DIR}\\node_modules\\corepack\\dist\\pnpm.js`;

describe("resolveWindowsCommand (ADR 0009)", () => {
  it("runs the .exe that pnpm's standalone launcher starts", async () => {
    const fs = memoryFs(
      { [`${BIN}\\pnpm.CMD`]: fixture("pnpm-standalone-11.cmd") },
      { executables: [PNPM_EXE] },
    );
    expect(await resolveWindowsCommand("pnpm", { fs, path: BIN })).toEqual({
      ok: true,
      file: PNPM_EXE,
      args: [],
    });
  });

  it("runs Corepack's script with the node.exe beside the launcher", async () => {
    const fs = memoryFs(
      { [`${NODE_DIR}\\pnpm.CMD`]: fixture("corepack-pnpm.cmd"), [COREPACK_JS]: "" },
      { executables: [`${NODE_DIR}\\node.exe`] },
    );
    expect(await resolveWindowsCommand("pnpm", { fs, path: NODE_DIR })).toEqual({
      ok: true,
      file: `${NODE_DIR}\\node.exe`,
      args: [COREPACK_JS],
    });
  });

  it("uses node from PATH when none is beside the launcher, but only an .exe", async () => {
    const shimDir = "C:\\tools";
    const files = {
      [`${shimDir}\\pnpm.CMD`]: fixture("corepack-pnpm.cmd"),
      [`${shimDir}\\node_modules\\corepack\\dist\\pnpm.js`]: "",
    };
    // PATH lookup tries PATHEXT's spelling; Windows ignores the case, this fake does not.
    const withExe = memoryFs(files, { executables: [`${NODE_DIR}\\node.EXE`] });
    expect(
      await resolveWindowsCommand("pnpm", { fs: withExe, path: `${shimDir};${NODE_DIR}` }),
    ).toEqual({
      ok: true,
      file: `${NODE_DIR}\\node.EXE`,
      args: [`${shimDir}\\node_modules\\corepack\\dist\\pnpm.js`],
    });

    const withCmd = memoryFs({ ...files, [`${NODE_DIR}\\node.CMD`]: "@node.exe %*" });
    expect(
      await resolveWindowsCommand("pnpm", { fs: withCmd, path: `${shimDir};${NODE_DIR}` }),
    ).toMatchObject({ ok: false, reason: "failed" });
  });

  it("follows PATH order, then PATHEXT order, as cmd does", async () => {
    const fs = memoryFs(
      {},
      { executables: ["C:\\a\\pnpm.EXE", "C:\\b\\pnpm.COM", "C:\\b\\pnpm.EXE"] },
    );
    expect(await resolveWindowsCommand("pnpm", { fs, path: "C:\\b;C:\\a" })).toMatchObject({
      file: "C:\\b\\pnpm.COM",
    });
    expect(
      await resolveWindowsCommand("pnpm", { fs, path: "C:\\b;C:\\a", pathext: ".EXE;.COM" }),
    ).toMatchObject({ file: "C:\\b\\pnpm.EXE" });
  });

  it("never looks in the current directory or in relative PATH entries", async () => {
    const fs = memoryFs({}, { executables: [".\\pnpm.EXE", "rel\\pnpm.EXE", "C:\\ok\\pnpm.EXE"] });
    expect(await resolveWindowsCommand("pnpm", { fs, path: ".;rel;;C:\\ok" })).toMatchObject({
      file: "C:\\ok\\pnpm.EXE",
    });
    expect(await resolveWindowsCommand("pnpm", { fs, path: ".;rel" })).toEqual({
      ok: false,
      reason: "not-found",
      message: "pnpm is not installed or not in PATH",
    });
  });

  it("accepts quoted PATH entries", async () => {
    const fs = memoryFs({}, { executables: ["C:\\Program Files\\pnpm\\pnpm.EXE"] });
    expect(
      await resolveWindowsCommand("pnpm", { fs, path: '"C:\\Program Files\\pnpm"' }),
    ).toMatchObject({ ok: true, file: "C:\\Program Files\\pnpm\\pnpm.EXE" });
  });

  it("never runs a launcher it cannot read whole, or one whose target is missing", async () => {
    const alias = memoryFs({ [`${BIN}\\pnpm.CMD`]: fixture("pnpm-alias-pn.cmd") });
    expect(await resolveWindowsCommand("pnpm", { fs: alias, path: BIN })).toEqual({
      ok: false,
      reason: "failed",
      message: `${BIN}\\pnpm.CMD is a launcher actually cannot run without a shell`,
    });

    const missing = memoryFs({ [`${BIN}\\pnpm.CMD`]: fixture("pnpm-standalone-11.cmd") });
    expect(await resolveWindowsCommand("pnpm", { fs: missing, path: BIN })).toEqual({
      ok: false,
      reason: "failed",
      message: `${BIN}\\pnpm.CMD runs ${PNPM_EXE}, which does not exist`,
    });

    const ps1 = memoryFs({ [`${BIN}\\pnpm.PS1`]: "& pnpm.exe" });
    expect(
      await resolveWindowsCommand("pnpm", { fs: ps1, path: BIN, pathext: ".EXE;.PS1" }),
    ).toMatchObject({ ok: false, reason: "failed" });
  });
});
