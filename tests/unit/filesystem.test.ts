import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
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
    await expect(fs.exists(loop("loop"))).rejects.toMatchObject({ code: "ELOOP" });
  });

  it("never blocks on a FIFO", async () => {
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
