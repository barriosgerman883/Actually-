import { parseArgs } from "node:util";
import { EXIT, type RuntimeFactory } from "../cli/run.js";
import {
  answer,
  classify,
  errorResponse,
  ERROR,
  type Handlers,
  type RequestId,
  type Response,
} from "./protocol.js";
import { callTool } from "./tools.js";

/** A line longer than this is rejected rather than buffered without bound. */
export const MAX_LINE_BYTES = 1024 * 1024;

export interface McpIo {
  /** The client's messages, one JSON-RPC message per line. */
  stdin: AsyncIterable<string | Uint8Array>;
  /** Carries MCP messages only (MCP stdio transport). */
  stdout: (text: string) => void;
  /** Logs for the client; never part of the protocol. */
  stderr: (text: string) => void;
  cwd: string;
}

const USAGE = `Usage: actually mcp [--offline] [--no-cache]

Runs actually as an MCP server over stdio, for an agent to call. It reads
JSON-RPC messages on stdin and writes them on stdout until stdin closes.

  --offline    Never query npm or GitHub, whatever a call asks
  --no-cache   Neither read nor write the response cache
`;

/**
 * Serves MCP over stdio until stdin closes, then waits for pending calls.
 *
 * Tool calls run one at a time: a call runs a full inventory, and the
 * response cache is not known to handle concurrent writes. Everything else
 * is answered as soon as it arrives. A cancelled call gets no response,
 * as the protocol asks.
 */
export async function serveMcp(
  argv: string[],
  io: McpIo,
  createRuntime: RuntimeFactory,
): Promise<number> {
  let values: { offline?: boolean; "no-cache"?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        offline: { type: "boolean" },
        "no-cache": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    io.stderr(`actually: ${(error as Error).message}\n${USAGE}`);
    return EXIT.usage;
  }
  if (values.help) {
    io.stdout(USAGE);
    return EXIT.ok;
  }

  const send = (response: Response) => io.stdout(`${JSON.stringify(response)}\n`);
  const logged = new Set<string>();
  const onVersion = (version: string) => {
    if (logged.has(version)) return;
    logged.add(version);
    io.stderr(`actually mcp: protocol ${version}\n`);
  };

  const handlers = (signal?: AbortSignal): Handlers => ({
    onVersion,
    callTool: (name, args) =>
      callTool(name, args, {
        createRuntime,
        cwd: io.cwd,
        offline: values.offline === true,
        noCache: values["no-cache"] === true,
        signal,
      }),
  });

  const key = (id: RequestId) => `${typeof id}:${id}`;
  const running = new Map<string, AbortController>();
  let queue: Promise<void> = Promise.resolve();
  const pending = new Set<Promise<void>>();
  const track = (work: Promise<void>) => {
    const tracked = work.catch((error: unknown) => {
      io.stderr(`actually mcp: ${(error as Error).message}\n`);
    });
    pending.add(tracked);
    void tracked.finally(() => pending.delete(tracked));
    return tracked;
  };

  const handleLine = (line: string) => {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      send(errorResponse(null, ERROR.parse, "not valid JSON"));
      return;
    }
    const message = classify(value);
    if (message.kind === "invalid") return send(message.response);
    if (message.kind === "ignored") return;
    if (message.kind === "notification") {
      if (message.method === "notifications/cancelled") {
        const id = message.params.requestId;
        if (typeof id === "string" || typeof id === "number") running.get(key(id))?.abort();
      }
      return;
    }

    const { request } = message;
    if (request.method !== "tools/call") {
      track(answer(request, handlers()).then(send));
      return;
    }
    const controller = new AbortController();
    running.set(key(request.id), controller);
    queue = track(
      queue.then(async () => {
        try {
          if (controller.signal.aborted) return;
          const response = await answer(request, handlers(controller.signal));
          if (!controller.signal.aborted) send(response);
        } finally {
          running.delete(key(request.id));
        }
      }),
    );
  };

  // Lines are split on bytes, so a character split across chunks is decoded
  // whole, and a line over the limit is dropped up to its newline.
  const decoder = new TextDecoder("utf-8");
  let buffer: Uint8Array[] = [];
  let size = 0;
  let oversized = false;
  const flush = () => {
    const bytes = Buffer.concat(buffer);
    buffer = [];
    size = 0;
    const line = decoder.decode(bytes).replace(/\r$/, "");
    if (line.trim() !== "") handleLine(line);
  };
  for await (const chunk of io.stdin) {
    let bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    for (let newline = bytes.indexOf(0x0a); newline !== -1; newline = bytes.indexOf(0x0a)) {
      const head = bytes.subarray(0, newline);
      bytes = bytes.subarray(newline + 1);
      if (oversized) {
        oversized = false;
        buffer = [];
        size = 0;
        continue;
      }
      if (size + head.length > MAX_LINE_BYTES) {
        buffer = [];
        size = 0;
        send(errorResponse(null, ERROR.invalidRequest, "message too large"));
        continue;
      }
      buffer.push(head);
      flush();
    }
    if (oversized) continue;
    if (size + bytes.length > MAX_LINE_BYTES) {
      oversized = true;
      buffer = [];
      size = 0;
      send(errorResponse(null, ERROR.invalidRequest, "message too large"));
      continue;
    }
    buffer.push(bytes);
    size += bytes.length;
  }
  if (!oversized && size > 0) flush();

  while (pending.size > 0) await Promise.all([...pending]);
  return EXIT.ok;
}
