import type { ToolStatus } from "../../core/model.js";

export interface Style {
  green(text: string): string;
  yellow(text: string): string;
  red(text: string): string;
  dim(text: string): string;
  bold(text: string): string;
}

const wrap = (open: number, close: number) => (text: string) =>
  `\u001b[${open}m${text}\u001b[${close}m`;

export function createStyle(enabled: boolean): Style {
  if (!enabled) {
    const id = (t: string) => t;
    return { green: id, yellow: id, red: id, dim: id, bold: id };
  }
  return {
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    red: wrap(31, 39),
    dim: wrap(2, 22),
    bold: wrap(1, 22),
  };
}

/** Symbols are never the only carrier of meaning (docs/design.md §6). */
const SYMBOL: Record<ToolStatus, string> = {
  current: "✓",
  outdated: "↑",
  unknown: "?",
  warning: "!",
  error: "×",
};

export const STATUS_TEXT: Record<ToolStatus, string> = {
  current: "up to date",
  outdated: "update available",
  unknown: "unknown",
  warning: "check",
  error: "error",
};

export function symbolFor(status: ToolStatus, style: Style): string {
  const symbol = SYMBOL[status];
  switch (status) {
    case "current":
      return style.green(symbol);
    case "outdated":
    case "warning":
      return style.yellow(symbol);
    case "error":
      return style.red(symbol);
    case "unknown":
      return style.dim(symbol);
  }
}
