import type { FetchResult } from './fetchResult';
import { RetryStrategy } from './retry';

export const REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_RETRY_AFTER_MS = 60_000;

export const HEADER_ETAG = 'ETag';
export const HEADER_IF_NONE_MATCH = 'If-None-Match';
export const HEADER_LAST_MODIFIED = 'Last-Modified';
export const HEADER_IF_MODIFIED_SINCE = 'If-Modified-Since';
export const HEADER_RETRY_AFTER = 'Retry-After';

interface CacheState {
  etag: string | null;
  lastModified: string | null;
  lastModifiedAt: Date | null;
}

const EMPTY_CACHE: CacheState = { etag: null, lastModified: null, lastModifiedAt: null };

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Parses Retry-After as seconds or an HTTP-date. Falls back to {@link DEFAULT_RETRY_AFTER_MS}. */
export function parseRetryAfterMs(retryAfter: string | null | undefined, now = Date.now()): number {
  const trimmed = retryAfter?.trim();
  if (!trimmed) {
    return DEFAULT_RETRY_AFTER_MS;
  }

  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds) && Number.isFinite(seconds)) {
    return Math.max(seconds, 0) * 1_000;
  }

  const retryAt = parseHttpDate(trimmed);
  if (retryAt != null) {
    return Math.max(retryAt.getTime() - now, 0);
  }

  return DEFAULT_RETRY_AFTER_MS;
}

export function parseHttpDate(value: string): Date | null {
  const parsed = Date.parse(value.trim());
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * Fetches flag configuration JSON from the CDN with conditional GET, retry, and stale-node defense.
 */
export class CdnFetcher {
  private _state: CacheState = { ...EMPTY_CACHE };
  private _rateLimitedUntil = 0;

  constructor(
    private readonly _url: string,
    private readonly _retryStrategy: RetryStrategy,
    private readonly _fetch: FetchFn = globalThis.fetch.bind(globalThis),
    private readonly _now: () => number = Date.now,
  ) {}

  isRateLimited(): boolean {
    return this._now() < this._rateLimitedUntil;
  }

  /**
   * Fetches the flag configuration from the CDN with retry.
   *
   * Returns 429 immediately when rate-limited.
   *
   * Deliberately has no in-flight guard. Per fm-knowledge-base providers.md 2.1, the poll
   * cadence is anchored to when each request is initiated, so every tick must issue a
   * request. PollingManager aborts the previous poll before starting the next, which bounds
   * this to one live fetch and discards the superseded result without emitting an event.
   */
  async fetch(signal?: AbortSignal): Promise<FetchResult> {
    if (this.isRateLimited()) {
      return { status: 429, body: null, etag: null, lastModified: null };
    }
    return await this._retryStrategy.execute(() => this._doFetch(signal), signal);
  }

  private async _doFetch(signal?: AbortSignal): Promise<FetchResult> {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal != null ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

    const headers = new Headers();
    if (this._state.etag != null) {
      headers.set(HEADER_IF_NONE_MATCH, this._state.etag);
    }
    if (this._state.lastModified != null) {
      headers.set(HEADER_IF_MODIFIED_SINCE, this._state.lastModified);
    }

    const response = await this._fetch(this._url, { method: 'GET', headers, signal: requestSignal });
    const status = response.status;

    if (status === 304) {
      return {
        status: 304,
        body: null,
        etag: this._state.etag,
        lastModified: this._state.lastModified,
      };
    }

    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get(HEADER_RETRY_AFTER), this._now());
      this._rateLimitedUntil = this._now() + retryAfterMs;
      return { status: 429, body: null, etag: null, lastModified: null };
    }

    const newEtag = response.headers.get(HEADER_ETAG);
    const newLastModified = response.headers.get(HEADER_LAST_MODIFIED);

    if (status >= 200 && status < 300) {
      const newLastModifiedAt = newLastModified != null ? parseHttpDate(newLastModified) : null;
      if (
        newLastModifiedAt != null &&
        this._state.lastModifiedAt != null &&
        newLastModifiedAt.getTime() <= this._state.lastModifiedAt.getTime()
      ) {
        // Stale-node defense: the CDN served a body older than what we already hold.
        // This is a real answer from the CDN, so it counts as a
        // successful poll exactly like a 304 (see fm-provider-test-harness cdn.feature,
        // "A 200 whose Last-Modified is not newer is ignored").
        return {
          status: 304,
          body: null,
          etag: this._state.etag,
          lastModified: this._state.lastModified,
        };
      }

      if (newLastModifiedAt != null) {
        this._state = {
          etag: newEtag,
          lastModified: newLastModified,
          lastModifiedAt: newLastModifiedAt,
        };
      } else {
        this._state = {
          ...this._state,
          etag: newEtag,
        };
      }

      const body = await response.text();
      return {
        status,
        body,
        etag: newEtag,
        lastModified: newLastModified,
      };
    }

    return { status, body: null, etag: newEtag, lastModified: newLastModified };
  }
}
