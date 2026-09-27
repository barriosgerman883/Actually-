import { NetworkError } from "../../core/errors.js";
import type { Clock, HttpClient, ResponseCache } from "../../core/ports.js";

/** Everything a resolver needs to reach the network through the cache. */
export interface NetContext {
  /** Undefined when running offline (--offline or [network] enabled = false). */
  http?: HttpClient;
  cache: ResponseCache;
  clock: Clock;
  ttlMs: number;
}

export type CachedGetResult =
  | {
      kind: "fresh" | "cached" | "revalidated";
      status: number;
      body: unknown;
      fetchedAt: number;
      headers: Record<string, string>;
    }
  | { kind: "stale"; body: unknown; fetchedAt: number; cause: "offline" | NetworkError }
  | { kind: "offline-miss" }
  | { kind: "error"; error: NetworkError };

/**
 * GET with the cache rules of docs/architecture.md §14:
 * fresh entries are used as is, expired ones are revalidated with a
 * conditional request, and a stale entry is only returned, marked as such,
 * when the network is unavailable, including a server error after the
 * retry. Only 200 responses are stored.
 */
export async function cachedGet(
  url: string,
  ctx: NetContext,
  headers: Record<string, string> = {},
): Promise<CachedGetResult> {
  const entry = await ctx.cache.get(url);
  const now = ctx.clock.now();
  if (entry && now - entry.fetchedAt < ctx.ttlMs) {
    return {
      kind: "cached",
      status: 200,
      body: entry.body,
      fetchedAt: entry.fetchedAt,
      headers: {},
    };
  }
  if (!ctx.http) {
    return entry
      ? { kind: "stale", body: entry.body, fetchedAt: entry.fetchedAt, cause: "offline" }
      : { kind: "offline-miss" };
  }
  const conditional: Record<string, string> = { ...headers };
  if (entry?.etag) conditional["if-none-match"] = entry.etag;
  else if (entry?.lastModified) conditional["if-modified-since"] = entry.lastModified;

  try {
    const response = await ctx.http.getJson(url, { headers: conditional });
    // The client already retried once: a 5xx means the service is unavailable.
    if (response.status >= 500) {
      throw new NetworkError("network", `${new URL(url).host} answered ${response.status}`);
    }
    if (response.status === 304 && entry) {
      await ctx.cache.set(url, { ...entry, fetchedAt: now });
      return {
        kind: "revalidated",
        status: 200,
        body: entry.body,
        fetchedAt: now,
        headers: response.headers,
      };
    }
    if (response.status === 200) {
      await ctx.cache.set(url, {
        fetchedAt: now,
        etag: response.headers.etag,
        lastModified: response.headers["last-modified"],
        body: response.body,
      });
    }
    return {
      kind: "fresh",
      status: response.status,
      body: response.body,
      fetchedAt: now,
      headers: response.headers,
    };
  } catch (error) {
    if (!(error instanceof NetworkError)) throw error;
    return entry
      ? { kind: "stale", body: entry.body, fetchedAt: entry.fetchedAt, cause: error }
      : { kind: "error", error };
  }
}

export function staleEvidenceText(fetchedAt: number, cause: "offline" | NetworkError): string {
  const when = new Date(fetchedAt).toISOString();
  return cause === "offline"
    ? `cached value from ${when}; running offline`
    : `cached value from ${when}; network unavailable (${cause.message})`;
}
