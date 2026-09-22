import { abortError, isAbortError } from './abort';
import type { FetchResult } from './fetchResult';

/**
 * One retry, not a loop: fm-knowledge-base providers.md 2.4 caps a fetch at two attempts so
 * it cannot outlive the shortest poll interval. Beyond that, recovery is the next tick's job.
 */
export const MAX_ATTEMPTS = 2;
export const BASE_DELAY_MS = 100;
export const MULTIPLIER = 2.0;
export const MAX_JITTER_FACTOR = 0.2;

export type Sleeper = (ms: number, signal?: AbortSignal) => Promise<void> | void;

export class RetryStrategy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly multiplier: number;
  readonly maxJitterFactor: number;
  private readonly _sleep: Sleeper;
  private readonly _random: () => number;

  constructor(options?: {
    maxAttempts?: number;
    baseDelayMs?: number;
    multiplier?: number;
    maxJitterFactor?: number;
    sleep?: Sleeper;
    random?: () => number;
  }) {
    this.maxAttempts = options?.maxAttempts ?? MAX_ATTEMPTS;
    this.baseDelayMs = options?.baseDelayMs ?? BASE_DELAY_MS;
    this.multiplier = options?.multiplier ?? MULTIPLIER;
    this.maxJitterFactor = options?.maxJitterFactor ?? MAX_JITTER_FACTOR;
    this._sleep = options?.sleep ?? defaultSleep;
    this._random = options?.random ?? Math.random;
  }

  static shouldRetry(status: number): boolean {
    return status >= 500 && status < 600;
  }

  async execute(fetch: () => Promise<FetchResult>, signal?: AbortSignal): Promise<FetchResult> {
    let lastResult: FetchResult | undefined;
    let lastError: Error | undefined;
    let delayMs = this.baseDelayMs;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      signal?.throwIfAborted();

      try {
        const result = await fetch();
        lastResult = result;
        if (!RetryStrategy.shouldRetry(result.status)) {
          return result;
        }
      } catch (err) {
        if (signal?.aborted || isAbortError(err)) {
          throw err instanceof Error ? err : abortError();
        }
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < this.maxAttempts) {
        const jitter = delayMs * this._random() * this.maxJitterFactor;
        // The sleep is abort-aware so that stopping the provider mid-backoff settles
        // immediately instead of keeping a timer alive for the remaining delay.
        await this._sleep(delayMs + jitter, signal);
        delayMs *= this.multiplier;
      }
    }

    if (lastResult != null) {
      return lastResult;
    }
    throw lastError ?? new Error('all retry attempts failed');
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
