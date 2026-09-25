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
  /** Whether a `Last-Modified`, in epoch milliseconds, is newer than the config in force. */
  isNewerThanApplied: (lastModifiedMs: number) => boolean;
}

/**
 * Drives CDN fetching: a periodic poll, plus out-of-band re-fetches requested by SSE.
 *
 * Per providers.md 2.1.1 at most one fetch is in flight, and the two triggers lose that race
 * differently: a poll tick is skipped, emitting neither success nor failure so it cannot reset
 * the grace timer, while an SSE re-fetch is deferred and coalesced rather than dropped, since
 * dropping it would hide a config change for up to a full poll interval.
 *
 * The interval is anchored to request initiation (providers.md 2.1).
 */
export class PollingManager {
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _abortController: AbortController | undefined;
  private _inFlight = false;
  private _stopped = true;
  private _intervalMs: number;

  /**
   * The SSE re-fetch waiting for the in-flight fetch to finish, holding the greatest `lastModified`
   * announced by the messages coalesced into it; they can arrive out of order.
   */
  private _pendingSseRefetch: { lastModifiedMs?: number } | undefined;

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
    this._pendingSseRefetch = undefined;
  }

  /**
   * Switches the cadence and re-anchors the schedule to now, so the first poll after a disconnect
   * is one short interval away rather than up to a full ten minutes.
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
   * Requests an out-of-band fetch for an SSE notification, without disturbing the poll cadence.
   * Runs immediately when the slot is free, otherwise coalesces into one pending re-fetch.
   *
   * @param lastModifiedMs epoch milliseconds announced by the message, when it carried one
   */
  requestSseRefetch(lastModifiedMs?: number): void {
    if (this._stopped) {
      return;
    }

    if (this._inFlight) {
      const pendingMs = this._pendingSseRefetch?.lastModifiedMs;
      this._pendingSseRefetch = {
        lastModifiedMs: lastModifiedMs == null ? pendingMs : Math.max(pendingMs ?? 0, lastModifiedMs),
      };
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
      this._drainPendingSseRefetch();
    }
  }

  /** Issues the deferred SSE re-fetch, unless the finished fetch already satisfied it. */
  private _drainPendingSseRefetch(): void {
    if (this._pendingSseRefetch == null || this._stopped) {
      return;
    }

    const announcedMs = this._pendingSseRefetch.lastModifiedMs;
    this._pendingSseRefetch = undefined;

    if (announcedMs != null && !this._callbacks.isNewerThanApplied(announcedMs)) {
      this._logger.debug('deferred SSE re-fetch dropped: the completed fetch already returned that config');
      return;
    }

    this._logger.debug('issuing deferred SSE re-fetch');
    this._runPoll();
  }
}
