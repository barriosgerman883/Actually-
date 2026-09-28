/** A request that could not complete. Always recoverable (architecture.md §13). */
export class NetworkError extends Error {
  constructor(
    readonly kind:
      "offline" | "timeout" | "network" | "host-not-allowed" | "invalid-response" | "cancelled",
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

/** Invalid usage (exit code 2). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
