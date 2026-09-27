import { EnvHttpProxyAgent, fetch, type Dispatcher } from "undici";
import { NetworkError } from "../../core/errors.js";
import type { HttpClient, HttpResponse } from "../../core/ports.js";

/** The only hosts actually talks to (docs/architecture.md §8). */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["registry.npmjs.org", "api.github.com"]);

const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 8;
const MAX_REDIRECTS = 5;
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

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

  function assertAllowed(url: URL): void {
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.host)) {
      throw new NetworkError("host-not-allowed", `host not allowed: ${url.host}`);
    }
  }

  /** Headers for one hop: the token goes only to api.github.com. */
  function headersFor(url: URL, base: Record<string, string>): Record<string, string> {
    const headers = { ...base };
    if (url.host === "api.github.com" && options.githubToken) {
      headers.authorization = `Bearer ${options.githubToken}`;
    }
    return headers;
  }

  /**
   * One request. Redirects are followed by hand, and only to allowed hosts
   * over https: GitHub redirects renamed repositories within api.github.com.
   */
  async function once(start: URL, baseHeaders: Record<string, string>): Promise<HttpResponse> {
    let url = start;
    let response;
    for (let hop = 0; ; hop++) {
      try {
        response = await fetch(url, {
          headers: headersFor(url, baseHeaders),
          dispatcher,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "manual",
        });
      } catch (error) {
        const name = (error as Error).name;
        if (name === "TimeoutError" || name === "AbortError") {
          throw new NetworkError("timeout", `request to ${url.host} timed out`);
        }
        throw new NetworkError("network", `could not reach ${url.host}`);
      }
      const location = response.headers.get("location");
      if (!REDIRECTS.has(response.status) || location === null) break;
      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) {
        throw new NetworkError("invalid-response", `too many redirects from ${start.host}`);
      }
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new NetworkError("invalid-response", `invalid redirect from ${url.host}`);
      }
      assertAllowed(next);
      url = next;
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
      assertAllowed(url);
      const headers: Record<string, string> = {
        "user-agent": options.userAgent,
        accept: "application/json",
        ...requestOptions.headers,
      };
      await acquire();
      try {
        try {
          const first = await once(url, headers);
          if (first.status < 500) return first;
        } catch (error) {
          if (
            !(error instanceof NetworkError) ||
            error.kind === "invalid-response" ||
            error.kind === "host-not-allowed"
          )
            throw error;
        }
        return await once(url, headers);
      } finally {
        release();
      }
    },
  };
}
