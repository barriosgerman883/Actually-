import { describe, expect, it, vi } from "vitest";
import { isUnsafeCodePoint } from "../../src/cli/output/sanitize.js";
import { EXIT, type RuntimeFactory } from "../../src/cli/run.js";
import { NETWORK_NOTICE, type RuntimeOptions } from "../../src/composition.js";
import { claimFrom } from "../../src/core/confidence.js";
import { defaultConfig } from "../../src/core/config.js";
import { notApplicable, type Inventory } from "../../src/core/model.js";
import { buildRecord } from "../../src/core/record.js";
import { MAX_LINE_BYTES, serveMcp } from "../../src/mcp/server.js";
import { fakeEnv } from "../helpers/fakes.js";

const fact = { kind: "fact" as const, source: "s", description: "d" };

function record(name: string, installed: string, latest: string, projectRoot?: string) {
  const installation = claimFrom({ provider: "pnpm" }, [fact]);
  return buildRecord({
    name,
    scope: projectRoot ? "project" : "global",
    projectRoot,
    versions: {
      requested: notApplicable,
      resolved: notApplicable,
      installed: claimFrom(installed, [fact]),
      latest: claimFrom(latest, [fact]),
    },
    installation,
    source: notApplicable,
    update: installation,
  });
}

const inventory: Inventory = {
  tools: [
    record("a", "1.0.0", "2.0.0"),
    record("b", "1.0.0", "1.0.0"),
    record("a", "1.0.0", "1.0.0", "/p"),
  ],
  projects: [],
  diagnostics: [],
};

/** A stdin the test writes to while the server reads it. */
function feed() {
  const chunks: (string | Uint8Array)[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  const poke = () => {
    wake?.();
    wake = undefined;
  };
  const stdin: AsyncIterable<string | Uint8Array> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        const chunk = chunks.shift();
        if (chunk !== undefined) yield chunk;
        else if (ended) return;
        else await new Promise<void>((resolve) => (wake = resolve));
      }
    },
  };
  return {
    stdin,
    push: (chunk: string | Uint8Array) => {
      chunks.push(chunk);
      poke();
    },
    end: () => {
      ended = true;
      poke();
    },
  };
}

interface Behavior {
  notice?: boolean;
  /** The first call waits until it is cancelled. */
  blockFirst?: boolean;
  inventory?: Inventory;
}

function server(argv: string[] = [], behavior: Behavior = {}) {
  const input = feed();
  const out: string[] = [];
  const err: string[] = [];
  const calls: RuntimeOptions[] = [];
  let active = 0;
  let maxActive = 0;
  const factory: RuntimeFactory = async (opts) => {
    const index = calls.push(opts) - 1;
    return {
      config: defaultConfig(),
      configWarnings: [],
      env: fakeEnv("/home/me"),
      inventory: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          if (behavior.notice && !opts.offline) opts.notice(NETWORK_NOTICE);
          if (behavior.blockFirst && index === 0)
            await new Promise<void>((resolve) =>
              opts.signal?.addEventListener("abort", () => resolve()),
            );
          // Long enough for overlapping calls to overlap, if they could.
          await new Promise((resolve) => setTimeout(resolve, 5));
          return behavior.inventory ?? inventory;
        } finally {
          active--;
        }
      },
    };
  };
  const done = serveMcp(
    argv,
    { stdin: input.stdin, stdout: (t) => out.push(t), stderr: (t) => err.push(t), cwd: "/tmp" },
    factory,
  );
  const send = (message: unknown) => input.push(`${JSON.stringify(message)}\n`);
  const responses = () =>
    out
      .join("")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));
  const byId = (id: unknown) => responses().find((r) => r.id === id);
  return { input, send, done, responses, byId, out, err, calls, maxActive: () => maxActive };
}

const call = (id: number | string, name: string, args: unknown, meta?: object) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
});
const MODERN = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};
const documentOf = (response: { result: { content: { text: string }[] } }) =>
  JSON.parse(response.result.content[0]?.text ?? "");

describe("actually mcp over stdio", () => {
  it("serves a session that starts with initialize, offline by default", async () => {
    const s = server();
    s.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    });
    s.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    s.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    s.send(call(3, "status", {}));
    s.input.end();
    expect(await s.done).toBe(EXIT.ok);

    expect(
      s
        .responses()
        .map((r) => r.id)
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(s.byId(1).result.protocolVersion).toBe("2025-11-25");
    const status = s.byId(3);
    expect(status.result.isError).toBeUndefined();
    const doc = documentOf(status);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.tools).toHaveLength(3);
    expect(doc.diagnostics).toEqual([]);
    expect(s.calls[0]?.offline).toBe(true);
    expect(s.err.join("")).toContain("actually mcp: protocol 2025-11-25");
  });

  it("serves stateless requests, and puts the network notice in the result", async () => {
    const s = server([], { notice: true });
    s.send({ jsonrpc: "2.0", id: "d", method: "server/discover", params: { _meta: MODERN } });
    s.send(call("e", "explain", { tool: "b", offline: false }, MODERN));
    s.input.end();
    await s.done;

    expect(s.byId("d").result.supportedVersions).toContain("2026-07-28");
    const explain = s.byId("e");
    expect(documentOf(explain).tools[0].versions.installed.evidence).toBeDefined();
    expect(s.calls[0]?.offline).toBe(false);
    const notice = explain.result.content[1]?.text as string;
    expect(notice).toContain("actually checks online");
    expect(notice).toContain("\nIt sends package names");
    expect(s.err.join("")).toContain("actually mcp: protocol 2026-07-28");
  });

  it("with --offline, no call reaches the network, whatever it asks", async () => {
    const s = server(["--offline"], { notice: true });
    s.send(call(1, "status", { offline: false }));
    s.input.end();
    await s.done;
    expect(s.calls[0]?.offline).toBe(true);
    expect(s.byId(1).result.content).toHaveLength(1);
  });

  it("reports what goes wrong in a call as a tool error the model can read", async () => {
    const s = server();
    s.send(call(1, "explain", { tool: "a" }));
    s.send(call(2, "explain", { tool: "--help" }));
    s.send(call(3, "status", { tools: "a" }));
    s.input.end();
    await s.done;

    const ambiguous = s.byId(1);
    expect(ambiguous.result.isError).toBe(true);
    expect(documentOf(ambiguous).diagnostics[0].message).toContain("global:pnpm:a");
    const flag = s.byId(2);
    expect(flag.result.isError).toBe(true);
    expect(documentOf(flag).diagnostics[0].message).toBe('no tool named "--help" was found');
    // Only the JSON document: no terminal advice such as `actually --help`.
    for (const response of [ambiguous, flag]) {
      expect(response.result.content).toHaveLength(1);
      expect(JSON.stringify(response)).not.toContain("for usage");
    }
    expect(s.byId(3).result).toMatchObject({
      isError: true,
      content: [{ text: 'unknown argument "tools"' }],
    });
  });

  it("runs one call at a time", async () => {
    const s = server();
    for (const id of [1, 2, 3]) s.send(call(id, "status", {}));
    s.input.end();
    await s.done;
    expect(s.responses()).toHaveLength(3);
    expect(s.maxActive()).toBe(1);
  });

  it("sends nothing for a cancelled call and goes on with the next", async () => {
    const s = server([], { blockFirst: true });
    s.send(call(7, "status", {}));
    await vi.waitFor(() => expect(s.calls).toHaveLength(1));
    s.send(call(8, "status", {}));
    s.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 7 } });
    s.input.end();
    await s.done;
    expect(s.responses().map((r) => r.id)).toEqual([8]);
    expect(s.calls[0]?.signal?.aborted).toBe(true);
  });

  it("reads lines split anywhere, CRLF, blank lines and bad JSON", async () => {
    const s = server();
    const bytes = Buffer.from(`${JSON.stringify(call(1, "explain", { tool: "ñandú" }))}\r\n\n`);
    const cut = bytes.indexOf(Buffer.from("ñ")) + 1; // inside the two bytes of ñ
    s.input.push(bytes.subarray(0, cut));
    s.input.push(bytes.subarray(cut));
    s.input.push("{not json\n");
    s.input.end();
    await s.done;
    // The parse error is answered at once; the call waits in the queue.
    expect(s.responses()).toHaveLength(2);
    expect(documentOf(s.byId(1)).diagnostics[0].message).toBe('no tool named "ñandú" was found');
    expect(s.byId(null)).toMatchObject({ error: { code: -32700 } });
  });

  it("rejects a line over the limit and reads the next one", async () => {
    const s = server();
    s.input.push(
      `{"jsonrpc":"2.0","id":1,"method":"ping","params":{"x":"${"a".repeat(MAX_LINE_BYTES)}`,
    );
    s.input.push(`"}}\n`);
    s.send({ jsonrpc: "2.0", id: 2, method: "ping" });
    s.input.end();
    await s.done;
    expect(s.responses()).toEqual([
      expect.objectContaining({ id: null, error: expect.objectContaining({ code: -32600 }) }),
      expect.objectContaining({ id: 2, result: expect.any(Object) }),
    ]);
  });

  it("escapes invisible characters from the inventory before the model reads them", async () => {
    const hidden = `x${String.fromCodePoint(0xe0049, 0xe0047, 0xad)}`;
    const s = server([], {
      inventory: { ...inventory, tools: [record(hidden, "1.0.0", "1.0.0")] },
    });
    s.send(call(1, "status", {}));
    s.input.end();
    await s.done;
    const text = s.byId(1).result.content[0].text as string;
    expect([...text].some((c) => isUnsafeCodePoint(c.codePointAt(0) ?? 0))).toBe(false);
    expect(JSON.parse(text).tools[0].name).toBe(hidden);
  });

  it("prints its usage with --help and rejects unknown flags", async () => {
    const help = server(["--help"]);
    expect(await help.done).toBe(EXIT.ok);
    expect(help.out.join("")).toContain("Usage: actually mcp");
    const bad = server(["--port", "1"]);
    expect(await bad.done).toBe(EXIT.usage);
    expect(bad.out).toEqual([]);
    expect(bad.err.join("")).toContain("Usage: actually mcp");
  });
});
