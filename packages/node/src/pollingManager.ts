import type { Logger } from '@openfeature/server-sdk';
import { resolveLogger } from '../../shared/src/logger.js';
import { isAbortError } from './abort';
import { isNotModified, isRateLimited, isSuccess, type FetchResult } from './fetchResult';

/** cadence while SSE is down or disabled */
export const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** cadence while SSE is connected; polling is a safety net */
export const SSE_CONNECTED_POLL_INTERVAL_MS = 600_000;

/** stands in for an announcement without `lastModified`, so it's never coalesced away or dropped */
const LAST_MODIFIED_UNKNOWN = Number.POSITIVE_INFINITY;

export interface PollingCallbacks {
  fetchFlags: (signal: AbortSignal) => Promise<FetchResult>;
  storeFlags: (body: string) => string[];
  /** Promotes the fetcher's staged cache validators once the body has been stored. */
  commitFetch: () => void;
  emitChange: (changedKeys: string[]) => void;
  emitSuccess: () => void;
  emitFailure: (reason: string) => void;
  /** whether an epoch-ms `Last-Modified` is newer than the config in force */
  isNewerThanApplied: (lastModifiedMs: number) => boolean;
}

/**
 * periodic CDN poll plus SSE re-fetches, anchored to request start (providers.md 2.1)
 * single-flight (providers.md 2.1.1): a losing tick is skipped silently, a losing SSE re-fetch coalesced
 */
export class PollingManager {
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _abortController: AbortController | undefined;
  private _inFlight = false;
  private _stopped = true;
  private _intervalMs: number;

  /** pending SSE re-fetch, as the greatest `lastModified` (ms) coalesced into it */
  private _pendingSseRefetchMs: number | undefined;

  /** announcement the running fetch serves; `undefined` for a poll tick */
  private _inFlightSseRefetchMs: number | undefined;

  private readonly _logger: Logger;

  constructor(
    private readonly _callbacks: PollingCallbacks,
    intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    logger?: Logger,
  ) {
    this._intervalMs = intervalMs;
    this._logger = logger ?? resolveLogger();
  }

  get intervalMs(): number {
    return this._intervalMs;
  }

  start(): void {
    if (!this._stopped && this._timer) {
      return;
    }
    this._stopped = false;
    this._startTimer();
  }

  stop(): void {
    this._stopped = true;
    // Shutdown is the one place a fetch is cancelled rather than waited out.
    this._abortController?.abort();
    this._abortController = undefined;
    this._clearTimer();
    this._pendingSseRefetchMs = undefined;
    this._inFlightSseRefetchMs = undefined;
  }

  /** switches cadence and re-anchors to now, so a disconnect polls within one short interval */
  setIntervalMs(intervalMs: number): void {
    if (intervalMs === this._intervalMs) {
      return;
    }
    this._intervalMs = intervalMs;
    if (!this._stopped && this._timer) {
      this._clearTimer();
      this._startTimer();
    }
  }

  /** out-of-band fetch for an SSE notification; runs now if the slot is free, else coalesces */
  requestOutOfBandFetch(lastModifiedMs?: number): void {
    if (this._stopped) {
      return;
    }

    const announcedMs = lastModifiedMs ?? LAST_MODIFIED_UNKNOWN;
    if (this._inFlight) {
      this._deferSseRefetch(announcedMs);
      this._logger.debug('SSE re-fetch deferred: a fetch is already in flight');
      return;
    }

    this._runPoll(announcedMs);
  }

  private _deferSseRefetch(announcedMs: number): void {
    this._pendingSseRefetchMs = Math.max(this._pendingSseRefetchMs ?? announcedMs, announcedMs);
  }

  private _startTimer(): void {
    this._timer = setInterval(() => this._runPoll(), this._intervalMs);
  }

  private _clearTimer(): void {
    if (this._timer != null) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /** @param sseRefetchMs announcement this fetch serves; omitted for a poll tick */
  private _runPoll(sseRefetchMs?: number): void {
    if (this._stopped || this._inFlight) {
      return;
    }

    const abortController = new AbortController();
    this._abortController = abortController;
    this._inFlight = true;
    this._inFlightSseRefetchMs = sseRefetchMs;
    void this._poll(abortController.signal);
  }

  private async _poll(signal: AbortSignal): Promise<void> {
    let rateLimited = false;
    try {
      const result = await this._callbacks.fetchFlags(signal);

      if (this._stopped || signal.aborted) {
        return;
      }

      if (isNotModified(result)) {
        this._logger.debug('flags not modified');
        this._callbacks.emitSuccess();
        return;
      }

      if (isRateLimited(result)) {
        this._logger.debug('rate limited; serving cached values');
        rateLimited = true;
        return;
      }

      if (!isSuccess(result)) {
        this._logger.warn(`poll returned a non-success status: HTTP ${result.status}`);
        this._callbacks.emitFailure(`HTTP ${result.status}`);
        return;
      }

      if (result.body == null || result.body === '') {
        this._logger.warn('poll returned an empty response body');
        this._callbacks.emitFailure('empty response body');
        return;
      }

      const changedKeys = this._callbacks.storeFlags(result.body);
      this._callbacks.commitFetch();

      this._callbacks.emitSuccess();
      if (changedKeys.length > 0) {
        this._logger.info(`flag configuration changed: ${changedKeys.join(', ')}`);
        this._callbacks.emitChange(changedKeys);
      }
    } catch (err) {
      if (this._stopped || signal.aborted || isAbortError(err)) {
        this._logger.debug('poll cancelled');
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this._logger.warn(`poll failed: ${message}`);
      this._callbacks.emitFailure(message);
    } finally {
      const issuedForMs = this._inFlightSseRefetchMs;
      this._inFlightSseRefetchMs = undefined;
      this._inFlight = false;
      if (rateLimited) {
        // CDN never answered; keep it pending for the first fetch after the window
        this._keepSseRefetchPending(issuedForMs);
      } else {
        this._drainPendingSseRefetch();
      }
    }
  }

  private _keepSseRefetchPending(issuedForMs: number | undefined): void {
    if (issuedForMs === undefined || this._stopped) {
      return;
    }
    this._deferSseRefetch(issuedForMs);
    this._logger.debug('SSE re-fetch rate limited; keeping it pending');
  }

  /** issues the deferred SSE re-fetch unless the finished fetch already satisfied it */
  private _drainPendingSseRefetch(): void {
    const announcedMs = this._pendingSseRefetchMs;
    if (announcedMs === undefined || this._stopped) {
      return;
    }
    this._pendingSseRefetchMs = undefined;

    if (!this._callbacks.isNewerThanApplied(announcedMs)) {
      this._logger.debug('deferred SSE re-fetch dropped: the completed fetch already returned that config');
      return;
    }

    this._logger.debug('issuing deferred SSE re-fetch');
    this._runPoll(announcedMs);
  }
}
