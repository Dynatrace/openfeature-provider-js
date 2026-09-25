import type { Logger } from '@openfeature/server-sdk';
import { resolveLogger } from '../../shared/src/logger.js';
import { isAbortError } from './abort';
import { isNotModified, isRateLimited, isSuccess, type FetchResult } from './fetchResult';

export const DEFAULT_POLL_INTERVAL_MS = 10_000;

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
 * Drives periodic CDN polling on a fixed interval, one fetch at a time.
 *
 * Per fm-knowledge-base providers.md 2.1.1, at most one fetch is in flight at any moment. A
 * tick that finds one running is skipped and has no observable effect: it emits neither
 * success nor failure, so it cannot reset the staleness grace timer. Reporting it either way
 * would be a lie, since the tick learned nothing the running fetch was not already learning.
 *
 * The interval is still anchored to request initiation (providers.md 2.1); skipping is the
 * exception that the bounded fetch duration makes rare.
 */
export class PollingManager {
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _abortController: AbortController | undefined;
  private _inFlight = false;
  private _stopped = true;

  private readonly _logger: Logger;

  constructor(
    private readonly _callbacks: PollingCallbacks,
    private readonly _intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    logger?: Logger,
  ) {
    this._logger = logger ?? resolveLogger();
  }

  start(): void {
    if (!this._stopped && this._timer != null) {
      return;
    }
    this._stopped = false;
    this._timer = setInterval(() => this._runPoll(), this._intervalMs);
  }

  stop(): void {
    this._stopped = true;
    // Shutdown is the one place a fetch is cancelled rather than waited out.
    this._abortController?.abort();
    this._abortController = undefined;
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
    }
  }
}
