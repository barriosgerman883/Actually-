import { describe, expect, it } from "vitest";
import { commandFileNames, pathDirs } from "../../src/core/command-path.js";

describe("PATH directories (architecture.md §3.3)", () => {
  it("keeps drive and UNC entries on Windows, in order, without repeats", () => {
    expect(
      pathDirs(
        'C:\\Git\\cmd;"C:\\Program Files\\nodejs";\\\\server\\share\\bin;C:\\Git\\cmd;D:/tools',
        "win32",
      ),
    ).toEqual(["C:\\Git\\cmd", "C:\\Program Files\\nodejs", "\\\\server\\share\\bin", "D:/tools"]);
  });

  it("never takes the current directory or a relative entry", () => {
    expect(pathDirs(".;bin;;C:relative;\\\\host;C:\\ok", "win32")).toEqual(["C:\\ok"]);
    expect(pathDirs(".:bin::/usr/bin:./x:/usr/local/bin", "linux")).toEqual([
      "/usr/bin",
      "/usr/local/bin",
    ]);
    expect(pathDirs(undefined, "linux")).toEqual([]);
  });

  it("splits on ; on Windows and on : elsewhere", () => {
    expect(pathDirs("/a:/b", "win32")).toEqual([]);
    expect(pathDirs("C:\\a;C:\\b", "linux")).toEqual([]);
  });
});

describe("command file names", () => {
  it("adds each PATHEXT extension on Windows, in order, and cmd's default without it", () => {
    expect(commandFileNames("git", "win32", ".EXE;.CMD;nope")).toEqual(["git.EXE", "git.CMD"]);
    expect(commandFileNames("git", "win32")).toEqual(["git.COM", "git.EXE", "git.BAT", "git.CMD"]);
  });

  it("is the name itself elsewhere", () => {
    expect(commandFileNames("git", "linux", ".EXE")).toEqual(["git"]);
  });
});
