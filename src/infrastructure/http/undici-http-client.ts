import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { NetworkError } from "../../core/errors.js";
import type { HttpClient, HttpResponse } from "../../core/ports.js";

/** The only hosts actually talks to (docs/architecture.md §8). */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["registry.npmjs.org", "api.github.com"]);

const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 8;

export interface HttpClientOptions {
  userAgent: string;
  /** Sent only to api.github.com, and only when the user enabled it (§14). */
  githubToken?: string;
  /** For tests only. Defaults to a proxy-aware agent. */
  dispatcher?: Dispatcher;
}

/**
 * The only component that uses the network (RA-003). Honors HTTP(S)_PROXY
 * and NO_PROXY, enforces the host allowlist, a timeout, one retry for
 * transient failures, and a concurrency limit.
 */
export function undiciHttpClient(options: HttpClientOptions): HttpClient {
  const dispatcher = options.dispatcher ?? new EnvHttpProxyAgent();
  let active = 0;
  const waiting: (() => void)[] = [];

  async function acquire(): Promise<void> {
    if (active < MAX_CONCURRENT) {
      active++;
      return;
    }
    // The releasing request hands its slot over directly.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }

  async function once(url: URL, headers: Record<string, string>): Promise<HttpResponse> {
    let response;
    try {
      response = await fetch(url, {
        headers,
        dispatcher,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "follow",
      });
    } catch (error) {
      const name = (error as Error).name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new NetworkError("timeout", `request to ${url.host} timed out`);
      }
      throw new NetworkError("network", `could not reach ${url.host}`);
    }
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key.toLowerCase()] = value;
    });
    let body: unknown = undefined;
    if (response.status !== 304) {
      const text = await response.text();
      if (text.length > 0 && (responseHeaders["content-type"] ?? "").includes("json")) {
        try {
          body = JSON.parse(text);
        } catch {
          throw new NetworkError("invalid-response", `invalid JSON from ${url.host}`);
        }
      }
    }
    return { status: response.status, headers: responseHeaders, body };
  }

  return {
    async getJson(rawUrl, requestOptions = {}) {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.host)) {
        throw new NetworkError("host-not-allowed", `host not allowed: ${url.host}`);
      }
      const headers: Record<string, string> = {
        "user-agent": options.userAgent,
        accept: "application/json",
        ...requestOptions.headers,
      };
      if (url.host === "api.github.com" && options.githubToken) {
        headers.authorization = `Bearer ${options.githubToken}`;
      }
      await acquire();
      try {
        try {
          const first = await once(url, headers);
          if (first.status < 500) return first;
        } catch (error) {
          if (!(error instanceof NetworkError) || error.kind === "invalid-response") throw error;
        }
        return await once(url, headers);
      } finally {
        release();
      }
    },
  };
}
