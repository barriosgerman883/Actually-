import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FatalError } from "../../src/core/errors.js";
import { loadConfig } from "../../src/infrastructure/config/toml-config.js";
import {
  MAX_TEXT_BYTES,
  nodeFilesystem,
} from "../../src/infrastructure/filesystem/node-filesystem.js";
import { scanProject } from "../../src/providers/project/project.js";
import { fakeEnv } from "../helpers/fakes.js";

// Real files: the defects are in how node:fs errors are mapped (F-46). A
// symlink loop fails with ELOOP for every user, root included, so it stands
// for "exists but cannot be checked" without depending on permissions.
const dir = mkdtempSync(join(tmpdir(), "actually-fs-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const fs = nodeFilesystem();

function loop(name: string): string {
  const a = join(dir, name);
  const b = join(dir, `${name}-other`);
  symlinkSync(b, a);
  symlinkSync(a, b);
  return a;
}

describe("nodeFilesystem (F-46)", () => {
  it("says a missing path does not exist, also below a file", async () => {
    writeFileSync(join(dir, "plain"), "x");
    expect(await fs.exists(join(dir, "missing"))).toBe(false);
    expect(await fs.exists(join(dir, "plain", "below"))).toBe(false);
    expect(await fs.exists(join(dir, "plain"))).toBe(true);
  });

  it("throws any other error instead of calling the path missing", async () => {
    const path = loop("loop");
    if (process.platform === "win32") {
      // Windows checks the link itself, which exists; the loop shows up when
      // the file is read, which then fails instead of reading nothing.
      await expect(fs.exists(path)).resolves.toBe(true);
      await expect(fs.readText(path)).rejects.toThrow();
      return;
    }
    await expect(fs.exists(path)).rejects.toMatchObject({ code: "ELOOP" });
  });

  it("never blocks on a FIFO, or on a named pipe on Windows (F-65)", async () => {
    if (process.platform === "win32") {
      // Windows has no FIFOs in the filesystem; its blocking file is a pipe
      // with a server listening, which stat calls a regular file.
      const pipe = `\\\\.\\pipe\\actually-test-${process.pid}`;
      const server = createServer(() => {});
      await new Promise<void>((done) => server.listen(pipe, done));
      try {
        await expect(fs.readText(pipe)).rejects.toThrow();
      } finally {
        server.close();
      }
      return;
    }
    const fifo = join(dir, "fifo");
    execFileSync("mkfifo", [fifo]);
    await expect(fs.readText(fifo)).rejects.toThrow(/not a regular file/);
  });

  it("refuses a file too large to read", async () => {
    const big = join(dir, "big");
    writeFileSync(big, "");
    truncateSync(big, MAX_TEXT_BYTES + 1);
    await expect(fs.readText(big)).rejects.toThrow(/too large/);
  });

  it("makes a config file that cannot be checked fatal, not the defaults", async () => {
    const config = loop("config.toml");
    await expect(loadConfig(config, fs, fakeEnv(dir))).rejects.toBeInstanceOf(FatalError);
  });

  it("leaves the registry unknown when a .npmrc cannot be checked", async () => {
    const project = mkdtempSync(join(dir, "p-"));
    writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { a: "^1" } }));
    symlinkSync(join(project, ".npmrc-loop"), join(project, ".npmrc"));
    symlinkSync(join(project, ".npmrc"), join(project, ".npmrc-loop"));
    const scan = await scanProject(fs, project, project);
    expect(scan.registryUnknown).toMatch(/\.npmrc could not be read/);
  });
});

describe("executables on Windows (F-56)", () => {
  it("counts only the extensions of PATHEXT, ignoring case", async () => {
    const bin = mkdtempSync(join(dir, "bin-"));
    for (const name of ["tool.exe", "run.CMD", "notes.txt", "README", "script.ps1"]) {
      writeFileSync(join(bin, name), "x");
    }
    const win = nodeFilesystem({ platform: "win32", pathext: ".COM;.EXE;.BAT;.CMD" });
    const found = [];
    for (const name of ["tool.exe", "run.CMD", "notes.txt", "README", "script.ps1"]) {
      if (await win.isExecutableFile(join(bin, name))) found.push(name);
    }
    expect(found).toEqual(["tool.exe", "run.CMD"]);
    const defaults = nodeFilesystem({ platform: "win32" });
    expect(await defaults.isExecutableFile(join(bin, "script.ps1"))).toBe(true);
    expect(await defaults.isExecutableFile(join(bin, "notes.txt"))).toBe(false);
  });
});
