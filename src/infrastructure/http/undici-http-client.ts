import { EnvHttpProxyAgent, fetch, type Dispatcher, type Response } from "undici";
import { NetworkError } from "../../core/errors.js";
import type { HttpClient, HttpResponse } from "../../core/ports.js";

/** The only hosts actually talks to (docs/architecture.md §8). */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["registry.npmjs.org", "api.github.com"]);

const TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 8;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * Reads a response body up to MAX_BODY_BYTES. The npm manifest endpoint
 * returns a few kilobytes (architecture.md §14), so anything much larger is
 * not what was asked for.
 */
async function readBody(response: Response, url: URL, cancelled: () => boolean): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new NetworkError("invalid-response", `response from ${url.host} is too large`);
  }
  if (!response.body) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        await response.body.cancel().catch(() => {});
        throw new NetworkError("invalid-response", `response from ${url.host} is too large`);
      }
      text += decoder.decode(chunk, { stream: true });
    }
  } catch (error) {
    if (error instanceof NetworkError) throw error;
    if (cancelled()) throw new NetworkError("cancelled", `request to ${url.host} was cancelled`);
    const name = (error as Error).name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new NetworkError("timeout", `request to ${url.host} timed out`);
    }
    throw new NetworkError("network", `could not read the response from ${url.host}`);
  }
  return text + decoder.decode();
}

export interface HttpClientOptions {
  userAgent: string;
  /** Sent only to api.github.com, and only when the user enabled it (§14). */
  githubToken?: string;
  /** Cancels every pending and later request of this client (architecture.md §8). */
  signal?: AbortSignal;
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
  const cancelled = () => options.signal?.aborted === true;
  const signalFor = () =>
    options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS);
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
          signal: signalFor(),
          redirect: "manual",
        });
      } catch (error) {
        if (cancelled()) {
          throw new NetworkError("cancelled", `request to ${url.host} was cancelled`);
        }
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
      const text = await readBody(response, url, cancelled);
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
      if (cancelled()) {
        throw new NetworkError("cancelled", `request to ${url.host} was cancelled`);
      }
      await acquire();
      try {
        try {
          const first = await once(url, headers);
          if (first.status < 500) return first;
        } catch (error) {
          if (
            !(error instanceof NetworkError) ||
            error.kind === "invalid-response" ||
            error.kind === "host-not-allowed" ||
            error.kind === "cancelled"
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
