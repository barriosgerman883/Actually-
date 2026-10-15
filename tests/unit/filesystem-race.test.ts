import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import * as promises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TEXT_BYTES,
  nodeFilesystem,
} from "../../src/infrastructure/filesystem/node-filesystem.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, open: vi.fn(original.open), realpath: vi.fn(original.realpath) };
});

const dir = mkdtempSync(join(tmpdir(), "actually-fs-race-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.mocked(promises.open).mockClear());
const fs = nodeFilesystem();

describe("descriptor-based bounded text reads (F-70)", () => {
  it("reads the checked file even when its path is replaced after validation", async () => {
    const path = join(dir, "replace");
    writeFileSync(path, "original");
    const original = await vi.importActual<typeof promises>("node:fs/promises");
    vi.mocked(promises.open).mockImplementationOnce(async (...args) => {
      const handle = await original.open(...args);
      const stat = handle.stat.bind(handle);
      vi.spyOn(handle, "stat").mockImplementationOnce(async () => {
        const info = await stat();
        renameSync(path, `${path}-old`);
        writeFileSync(path, "replacement");
        return info;
      });
      return handle;
    });
    expect(await fs.readText(path)).toBe("original");
  });

  it("rejects growth beyond the limit after stat and closes the descriptor", async () => {
    const path = join(dir, "grow");
    writeFileSync(path, "small");
    const original = await vi.importActual<typeof promises>("node:fs/promises");
    let handle: promises.FileHandle | undefined;
    vi.mocked(promises.open).mockImplementationOnce(async (...args) => {
      handle = await original.open(...args);
      const stat = handle.stat.bind(handle);
      vi.spyOn(handle, "stat").mockImplementationOnce(async () => {
        const info = await stat();
        truncateSync(path, MAX_TEXT_BYTES + 1);
        return info;
      });
      return handle;
    });
    await expect(fs.readText(path)).rejects.toThrow(/too large/);
    expect(handle?.fd).toBe(-1);
  });

  it("decodes UTF-8 across read boundaries and reads empty files", async () => {
    const path = join(dir, "utf8");
    const text = "x".repeat(64 * 1024 - 1) + "€";
    writeFileSync(path, text);
    expect(await fs.readText(path)).toBe(text);
    writeFileSync(path, "");
    expect(await fs.readText(path)).toBe("");
  });

  it("rejects a FIFO substituted after realpath without waiting for a writer", async () => {
    if (process.platform === "win32") return; // Named pipes are covered in filesystem.test.ts.
    const path = join(dir, "swap-fifo");
    writeFileSync(path, "plain");
    const original = await vi.importActual<typeof promises>("node:fs/promises");
    vi.mocked(promises.realpath).mockImplementationOnce(async (input) => {
      const real = await original.realpath(input);
      renameSync(path, `${path}-old`);
      execFileSync("mkfifo", [path]);
      return real;
    });
    await expect(fs.readText(path)).rejects.toThrow(/not a regular file/);
  });
});
