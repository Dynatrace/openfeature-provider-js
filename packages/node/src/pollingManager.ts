import { isAbortError } from './abort';
import { isNotModified, isRateLimited, isSuccess, type FetchResult } from './fetchResult';

export const DEFAULT_POLL_INTERVAL_MS = 10_000;

export interface PollingCallbacks {
  fetchFlags: (signal: AbortSignal) => Promise<FetchResult>;
  /** Must be synchronous so a superseded poll can never overwrite a newer configuration. */
  storeFlags: (body: string) => string[];
  /** Promotes the fetcher's staged cache validators once the body has been stored. */
  commitFetch: () => void;
  emitChange: (changedKeys: string[]) => void;
  emitSuccess: () => void;
  emitFailure: (reason: string) => void;
}

/** Drives periodic CDN polling on a fixed interval with in-flight cancellation. */
export class PollingManager {
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _abortController: AbortController | undefined;
  private _stopped = true;

  constructor(
    private readonly _callbacks: PollingCallbacks,
    private readonly _intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  ) {}

  start(): void {
    if (!this._stopped && this._timer != null) {
      return;
    }
    this._stopped = false;
    this._timer = setInterval(() => this._runPoll(), this._intervalMs);
  }

  stop(): void {
    this._stopped = true;
    this._cancelCurrentPoll();
    if (this._timer != null) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private _cancelCurrentPoll(): void {
    this._abortController?.abort();
    this._abortController = undefined;
  }

  private _runPoll(): void {
    if (this._stopped) {
      return;
    }

    this._cancelCurrentPoll();
    const abortController = new AbortController();
    this._abortController = abortController;
    void this._poll(abortController.signal);
  }

  private async _poll(signal: AbortSignal): Promise<void> {
    try {
      const result = await this._callbacks.fetchFlags(signal);

      if (this._stopped || signal.aborted) {
        return;
      }

      if (isNotModified(result)) {
        this._callbacks.emitSuccess();
        return;
      }

      if (isRateLimited(result)) {
        return;
      }

      if (!isSuccess(result)) {
        this._callbacks.emitFailure(`HTTP ${result.status}`);
        return;
      }

      if (result.body == null || result.body === '') {
        this._callbacks.emitFailure('empty response body');
        return;
      }

      const changedKeys = this._callbacks.storeFlags(result.body);
      this._callbacks.commitFetch();

      this._callbacks.emitSuccess();
      if (changedKeys.length > 0) {
        this._callbacks.emitChange(changedKeys);
      }
    } catch (err) {
      if (this._stopped || signal.aborted || isAbortError(err)) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this._callbacks.emitFailure(message);
    }
  }
}
