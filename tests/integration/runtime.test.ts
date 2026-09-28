import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createRuntime, NETWORK_NOTICE } from "../../src/composition.js";
import { fakeEnv, fakeHttp, fakeRunner, json, ok, PNPM_CONFIG_PUBLIC } from "../helpers/fakes.js";

// The rules of the first-run notice live in createRuntime (design.md §12,
// F-49): real state and config directories, fake process runner and HTTP.
const base = mkdtempSync(join(tmpdir(), "actually-runtime-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

function world(name: string) {
  const home = join(base, name);
  const project = join(home, "p");
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ dependencies: { a: "^1.0.0", b: "^1.0.0" } }),
  );
  const events: string[] = [];
  const http = fakeHttp({
    "https://registry.npmjs.org/a/latest": json({ version: "1.0.0" }),
    "https://registry.npmjs.org/b/latest": json({ version: "1.0.0" }),
  });
  const deps = (vars: Record<string, string> = {}) => ({
    env: fakeEnv(home, {
      XDG_STATE_HOME: join(home, "state"),
      XDG_CACHE_HOME: join(home, "cache"),
      XDG_CONFIG_HOME: join(home, "config"),
      ...vars,
    }),
    runner: fakeRunner({ "pnpm.config.list": ok(PNPM_CONFIG_PUBLIC) }),
    httpClient: () => ({
      getJson: async (url: string, o?: { headers?: Record<string, string> }) => {
        events.push("request");
        return http.getJson(url, o);
      },
    }),
  });
  const runOnce = async (offline = false, vars: Record<string, string> = {}) => {
    const runtime = await createRuntime(
      {
        offline,
        noCache: true,
        cwd: project,
        notice: (text) => events.push(text === NETWORK_NOTICE ? "notice" : text),
      },
      deps(vars),
    );
    await runtime.inventory({ projectOnly: true });
  };
  return { home, events, runOnce };
}

describe("first-run network notice (design.md §12, F-49)", () => {
  it("shows the notice once, before the first request", async () => {
    const w = world("once");
    await w.runOnce();
    expect(w.events).toEqual(["notice", "request", "request"]);
    await w.runOnce();
    expect(w.events.filter((e) => e === "notice")).toHaveLength(1);
  });

  it("never shows it offline, and then still shows it on the first online run", async () => {
    const w = world("offline");
    await w.runOnce(true);
    expect(w.events).toEqual([]);
    await w.runOnce();
    expect(w.events[0]).toBe("notice");
  });

  it("shows it again when the marker cannot be written", async () => {
    const w = world("unwritable");
    // The state directory is a file, so the marker can never be written.
    writeFileSync(join(w.home, "state-file"), "");
    const vars = { XDG_STATE_HOME: join(w.home, "state-file") };
    await w.runOnce(false, vars);
    await w.runOnce(false, vars);
    expect(w.events.filter((e) => e === "notice")).toHaveLength(2);
  });
});
