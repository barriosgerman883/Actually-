#!/usr/bin/env node
import { createRuntime } from "../composition.js";
import { serveMcp } from "../mcp/server.js";
import { run } from "./run.js";

// Ctrl-C cancels pending requests, then ends the process the usual way.
const interrupt = new AbortController();
process.once("SIGINT", () => {
  interrupt.abort();
  process.kill(process.pid, "SIGINT");
});

const argv = process.argv.slice(2);
const stdout = (text: string) => process.stdout.write(text);
const stderr = (text: string) => process.stderr.write(text);

// `actually mcp` serves the same commands to an agent over stdio
// (docs/commands/mcp.md); everything else is a one-shot command.
const code =
  argv[0] === "mcp"
    ? await serveMcp(
        argv.slice(1),
        { stdin: process.stdin, stdout, stderr, cwd: process.cwd() },
        createRuntime,
      )
    : await run(
        argv,
        {
          stdout,
          stderr,
          cwd: process.cwd(),
          stdoutIsTTY: process.stdout.isTTY === true,
          noColorEnv: process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "",
          signal: interrupt.signal,
        },
        createRuntime,
      );
process.exitCode = code;
