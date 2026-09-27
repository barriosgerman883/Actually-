import { parseArgs } from "node:util";
import { findTool } from "../application/lookup.js";
import { FatalError, UsageError } from "../core/errors.js";
import type { Diagnostic, Inventory } from "../core/model.js";
import type { Runtime, RuntimeOptions } from "../composition.js";
import { VERSION } from "../version.js";
import {
  renderDiagnostics,
  renderExplain,
  renderStatus,
  renderToolDetail,
} from "./output/human.js";
import { documentJson, inventoryJson } from "./output/json.js";
import { createStyle } from "./output/style.js";

/** Exit codes (docs/architecture.md §3.1). */
export const EXIT = { ok: 0, updates: 1, usage: 2, fatal: 3 } as const;

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  stdoutIsTTY: boolean;
  noColorEnv: boolean;
}

export type RuntimeFactory = (options: RuntimeOptions) => Promise<Runtime>;

const HELP = `actually — what is on your machine, and why actually thinks so.

Usage:
  actually status [--global | --project]   Summary of tools and dependencies
  actually status <tool>                   Detail of one tool
  actually explain <tool>                  Evidence behind every conclusion

Options:
  --json         Machine-readable output on stdout
  --offline      Do not query npm or GitHub; use cached data only
  --no-cache     Neither read nor write the response cache
  --exit-code    Exit with 1 when updates are available
  --verbose      List everything, including up-to-date items
  --no-color     Disable colors (NO_COLOR is also respected)
  --debug        Show technical details on errors
  -h, --help     Show this help
  -v, --version  Show the version

actually never installs, updates or removes anything.
`;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      global: { type: "boolean" },
      project: { type: "boolean" },
      json: { type: "boolean" },
      offline: { type: "boolean" },
      "no-cache": { type: "boolean" },
      "exit-code": { type: "boolean" },
      verbose: { type: "boolean" },
      "no-color": { type: "boolean" },
      debug: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}

export async function run(argv: string[], io: Io, createRuntime: RuntimeFactory): Promise<number> {
  let values: ReturnType<typeof parse>["values"] = {};
  let positionals: string[];
  const wantsJson = argv.includes("--json");
  const failJson = (message: string) =>
    documentJson({
      tools: [],
      diagnostics: [{ severity: "error", source: "actually", message }],
      withEvidence: false,
    });

  try {
    try {
      ({ values, positionals } = parse(argv));
    } catch (error) {
      throw new UsageError((error as Error).message);
    }
    if (values.help) {
      io.stdout(HELP);
      return EXIT.ok;
    }
    if (values.version) {
      io.stdout(`${VERSION}\n`);
      return EXIT.ok;
    }

    const [command = "status", target, ...rest] = positionals;
    if (command !== "status" && command !== "explain")
      throw new UsageError(`unknown command "${command}"`);
    if (rest.length > 0) throw new UsageError(`unexpected argument "${rest[0]}"`);
    if (command === "explain" && !target) throw new UsageError("explain needs a tool name or id");
    if (values.global && values.project)
      throw new UsageError("use either --global or --project, not both");

    const runtime = await createRuntime({
      offline: values.offline === true,
      noCache: values["no-cache"] === true,
      cwd: io.cwd,
      notice: (text) => io.stderr(`${text}\n`),
    });
    const colorSetting = runtime.config.output.color;
    const color =
      !values.json &&
      !values["no-color"] &&
      !io.noColorEnv &&
      (colorSetting === "always" || (colorSetting === "auto" && io.stdoutIsTTY));
    const human = {
      home: runtime.env.homeDir,
      verbose: values.verbose === true,
      style: createStyle(color),
    };

    const inventory: Inventory = await runtime.inventory({
      globalOnly: values.global === true,
      projectOnly: values.project === true,
    });
    const diagnostics: Diagnostic[] = [
      ...runtime.configWarnings.map((message): Diagnostic => ({
        severity: "warning",
        source: "config",
        message,
      })),
      ...inventory.diagnostics,
    ];
    const full = { ...inventory, diagnostics };

    if (target) {
      const tool = findTool(full, target);
      const toolDiagnostics = diagnostics.filter(
        (d) => d.toolId === undefined || d.toolId === tool.id,
      );
      if (values.json) {
        io.stdout(
          documentJson({
            tools: [tool],
            diagnostics: toolDiagnostics,
            withEvidence: command === "explain",
          }),
        );
      } else {
        io.stdout(
          command === "explain" ? renderExplain(tool, human) : renderToolDetail(tool, human),
        );
        io.stderr(renderDiagnostics(toolDiagnostics, human.home));
      }
      return values["exit-code"] && tool.status === "outdated" ? EXIT.updates : EXIT.ok;
    }

    if (values.json) {
      io.stdout(inventoryJson(full));
    } else {
      io.stdout(renderStatus(full, human));
      io.stderr(renderDiagnostics(diagnostics, human.home));
    }
    return values["exit-code"] && full.tools.some((t) => t.status === "outdated")
      ? EXIT.updates
      : EXIT.ok;
  } catch (error) {
    if (error instanceof UsageError) {
      if (wantsJson) io.stdout(failJson(error.message));
      io.stderr(`actually: ${error.message}\nRun \`actually --help\` for usage.\n`);
      return EXIT.usage;
    }
    const message =
      error instanceof FatalError ? error.message : `unexpected error: ${(error as Error).message}`;
    if (wantsJson) io.stdout(failJson(message));
    io.stderr(`actually: ${message}\n`);
    if (values.debug && error instanceof Error && error.stack) io.stderr(`${error.stack}\n`);
    return EXIT.fatal;
  }
}
