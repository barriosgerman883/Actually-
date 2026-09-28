/** A request that could not complete. Always recoverable (architecture.md §13). */
export class NetworkError extends Error {
  constructor(
    readonly kind: "timeout" | "network" | "host-not-allowed" | "invalid-response" | "cancelled",
    message: string,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

/** Fatal: the run cannot continue (exit code 3). */
export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalError";
  }
}

/**
 * Invalid usage (exit code 2). `choices` are listed one per line after the
 * message, such as the ids an ambiguous name matches (design.md §9).
 */
export class UsageError extends Error {
  constructor(
    message: string,
    readonly choices: string[] = [],
  ) {
    super(choices.length > 0 ? `${message}\n${choices.map((c) => `  ${c}`).join("\n")}` : message);
    this.name = "UsageError";
    this.summary = message;
  }

  /** The message without the choices. */
  readonly summary: string;
}
