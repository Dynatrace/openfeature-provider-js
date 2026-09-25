import type { Logger } from '@openfeature/server-sdk';
import { resolveLogger } from '../../shared/src/logger.js';
import { isAbortError } from './abort';
import { isNotModified, isRateLimited, isSuccess, type FetchResult } from './fetchResult';

/** Cadence while SSE is disconnected or disabled: polling is the only update mechanism. */
export const DEFAULT_POLL_INTERVAL_MS = 10_000;

/** Cadence while SSE is connected: notifications carry the changes, polling is a safety net. */
export const SSE_CONNECTED_POLL_INTERVAL_MS = 600_000;

export interface PollingCallbacks {
  fetchFlags: (signal: AbortSignal) => Promise<FetchResult>;
  storeFlags: (body: string) => string[];
  /** Promotes the fetcher's staged cache validators once the body has been stored. */
  commitFetch: () => void;
  emitChange: (changedKeys: string[]) => void;
  emitSuccess: () => void;
  emitFailure: (reason: string) => void;
}

/**
 * Drives CDN fetching: a periodic poll, plus out-of-band re-fetches requested by SSE.
 *
 * Per fm-knowledge-base providers.md 2.1.1, at most one fetch is in flight at any moment, and the
 * two triggers lose that race differently:
 *
 * - A **poll tick** that finds a fetch running is skipped and has no observable effect: it emits
 *   neither success nor failure, so it cannot reset the staleness grace timer. Reporting it either
 *   way would be a lie, since the tick learned nothing the running fetch was not already learning.
 * - An **SSE re-fetch** is deferred and coalesced instead of dropped, because dropping it would
 *   hide a config change for up to a full poll interval — ten minutes while SSE is connected.
 *
 * The interval is anchored to request initiation (providers.md 2.1); skipping is the exception
 * that the bounded fetch duration makes rare.
 */
export class PollingManager {
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _abortController: AbortController | undefined;
  private _inFlight = false;
  private _stopped = true;
  private _intervalMs: number;

  /** Set while an SSE re-fetch is waiting for the in-flight fetch to finish. */
  private _sseRefetchPending = false;

  /**
   * The greatest `lastModified` announced by the coalesced SSE messages, in epoch milliseconds.
   * Notifications can arrive out of order, so the pending re-fetch keeps the greatest value
   * rather than the most recently received one.
   */
  private _sseRefetchLastModifiedMs: number | undefined;

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
    if (!this._stopped && this._timer != null) {
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
    this._sseRefetchPending = false;
    this._sseRefetchLastModifiedMs = undefined;
  }

  /**
   * Switches the cadence and re-anchors the schedule to now.
   *
   * Called only when SSE connects or disconnects, so there is no per-tick reschedule churn.
   * Re-anchoring is what closes the cadence gap on a disconnect: the first fast poll is one short
   * interval away rather than up to a full ten minutes.
   */
  setIntervalMs(intervalMs: number): void {
    if (intervalMs === this._intervalMs) {
      return;
    }
    this._intervalMs = intervalMs;
    if (!this._stopped && this._timer != null) {
      this._clearTimer();
      this._startTimer();
    }
  }

  /**
   * Requests an out-of-band fetch in response to an SSE notification.
   *
   * Runs immediately when the fetch slot is free, and does not disturb the poll cadence either
   * way. When a fetch is already running the request is coalesced into a single pending re-fetch
   * that is issued once the slot frees, and dropped at that point if the completed fetch already
   * returned a config at least as new as the greatest announced `lastModified`.
   *
   * @param lastModifiedMs epoch milliseconds announced by the message, when it carried one
   */
  requestSseRefetch(lastModifiedMs?: number): void {
    if (this._stopped) {
      return;
    }

    if (this._inFlight) {
      this._sseRefetchPending = true;
      if (lastModifiedMs != null) {
        this._sseRefetchLastModifiedMs = Math.max(this._sseRefetchLastModifiedMs ?? 0, lastModifiedMs);
      }
      this._logger.debug('SSE re-fetch deferred: a fetch is already in flight');
      return;
    }

    this._runPoll();
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

  private _runPoll(): void {
    if (this._stopped || this._inFlight) {
      return;
    }

    const abortController = new AbortController();
    this._abortController = abortController;
    this._inFlight = true;
    void this._poll(abortController.signal);
  }

  private async _poll(signal: AbortSignal): Promise<void> {
    let lastModifiedMs: number | undefined;
    try {
      const result = await this._callbacks.fetchFlags(signal);

      if (this._stopped || signal.aborted) {
        return;
      }

      lastModifiedMs = parseLastModifiedMs(result.lastModified);

      if (isNotModified(result)) {
        this._logger.debug('flags not modified');
        this._callbacks.emitSuccess();
        return;
      }

      if (isRateLimited(result)) {
        this._logger.debug('rate limited; serving cached values');
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
      this._inFlight = false;
      this._drainPendingSseRefetch(lastModifiedMs);
    }
  }

  /**
   * Issues the deferred SSE re-fetch, unless the fetch that just finished already satisfied it.
   *
   * @param fetchedLastModifiedMs `Last-Modified` of the config the completed fetch returned, or of
   *        the config still held on a 304
   */
  private _drainPendingSseRefetch(fetchedLastModifiedMs: number | undefined): void {
    if (!this._sseRefetchPending || this._stopped) {
      return;
    }

    const announcedMs = this._sseRefetchLastModifiedMs;
    this._sseRefetchPending = false;
    this._sseRefetchLastModifiedMs = undefined;

    if (announcedMs != null && fetchedLastModifiedMs != null && fetchedLastModifiedMs >= announcedMs) {
      this._logger.debug('deferred SSE re-fetch dropped: the completed fetch already returned that config');
      return;
    }

    this._logger.debug('issuing deferred SSE re-fetch');
    this._runPoll();
  }
}

function parseLastModifiedMs(lastModified: string | null): number | undefined {
  if (lastModified == null) {
    return undefined;
  }
  const parsed = Date.parse(lastModified);
  return Number.isNaN(parsed) ? undefined : parsed;
}
