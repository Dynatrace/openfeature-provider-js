import type { Logger } from '@openfeature/server-sdk';
import { resolveLogger } from '../../shared/src/logger.js';
import type { FetchResult } from './fetchResult';
import { RetryStrategy } from './retry';

export const REQUEST_TIMEOUT_MS = 4_000;
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
  if (Number.isFinite(seconds)) {
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
  private _pendingState: CacheState | null = null;
  private _rateLimitedUntil = 0;

  private readonly _logger: Logger;

  constructor(
    private readonly _url: string,
    private readonly _retryStrategy: RetryStrategy,
    private readonly _fetch: FetchFn = globalThis.fetch.bind(globalThis),
    private readonly _now: () => number = Date.now,
    logger?: Logger,
  ) {
    this._logger = logger ?? resolveLogger();
  }

  isRateLimited(): boolean {
    return this._now() < this._rateLimitedUntil;
  }

  /**
   * `Last-Modified` of the config in force, in epoch milliseconds. Staged validators do not count:
   * this is what an SSE message's `lastModified` has to beat to be worth acting on.
   */
  get committedLastModifiedMs(): number | null {
    return this._state.lastModifiedAt?.getTime() ?? null;
  }

  /**
   * Drops the cached validators so the next fetch performs an unconditional GET.
   *
   * A provider that is closed and registered again starts a fresh lifecycle and expects a
   * full configuration; the previous lifecycle's validators would instead earn a 304 that
   * carries no body. The rate-limit window deliberately survives, since a Retry-After from
   * the CDN outlives our lifecycle.
   */
  reset(): void {
    this._state = { ...EMPTY_CACHE };
    this._pendingState = null;
  }

  /**
   * Promotes the validators staged by the last successful fetch.
   *
   * The caller invokes this only once it has accepted the body. Until then the previous
   * validators stay in force, so a body that fails to parse or store is re-requested in
   * full on the next poll instead of being answered with a 304 we would treat as success.
   */
  commit(): void {
    if (this._pendingState != null) {
      this._state = this._pendingState;
      this._pendingState = null;
    }
  }

  /**
   * Fetches the flag configuration from the CDN with retry.
   *
   * Returns 429 immediately when rate-limited.
   *
   * A fetch cannot outlive the shortest poll interval, which fm-knowledge-base
   * providers.md 2.1 states as an invariant: two 4s attempts plus ~0.12s of backoff is
   * 8.12s against a 10s interval. Any change to the timeout, the attempt count or the
   * backoff has to preserve that. PollingManager skips a tick that finds a fetch already
   * running (providers.md 2.1.1), so at most one is ever in flight.
   */
  async fetch(signal?: AbortSignal): Promise<FetchResult> {
    if (this.isRateLimited()) {
      return { status: 429, body: null, etag: null, lastModified: null };
    }
    return await this._retryStrategy.execute(() => this._doFetch(signal), signal);
  }

  /** A 304-shaped result carrying the validators we already hold. */
  private _notModified(): FetchResult {
    return { status: 304, body: null, etag: this._state.etag, lastModified: this._state.lastModified };
  }

  private async _doFetch(signal?: AbortSignal): Promise<FetchResult> {
    signal?.throwIfAborted();

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
      return this._notModified();
    }

    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get(HEADER_RETRY_AFTER), this._now());
      this._rateLimitedUntil = this._now() + retryAfterMs;
      this._logger.debug(`rate limited by the CDN; suppressing requests for ${retryAfterMs}ms`);
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
        this._logger.warn('CDN served a config older than the cached one; ignoring it (stale node)');
        return this._notModified();
      }

      const body = await response.text();

      this._pendingState =
        newLastModifiedAt != null
          ? { etag: newEtag, lastModified: newLastModified, lastModifiedAt: newLastModifiedAt }
          : { ...this._state, etag: newEtag };

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
