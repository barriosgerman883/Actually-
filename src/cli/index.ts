#!/usr/bin/env node
import { createRuntime } from "../composition.js";
import { run } from "./run.js";

const code = await run(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    stdoutIsTTY: process.stdout.isTTY === true,
    noColorEnv: process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "",
  },
  createRuntime,
);
process.exitCode = code;
