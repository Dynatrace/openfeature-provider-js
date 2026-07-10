import type { FetchResult } from './fetchResult';

export const MAX_ATTEMPTS = 5;
export const BASE_DELAY_MS = 100;
export const MULTIPLIER = 2.0;
export const MAX_JITTER_FACTOR = 0.2;

export type Sleeper = (ms: number) => Promise<void> | void;

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
    this._sleep = options?.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this._random = options?.random ?? Math.random;
  }

  static shouldRetry(status: number): boolean {
    return status >= 500 && status < 600;
  }

  async execute(fetch: () => Promise<FetchResult>): Promise<FetchResult> {
    let lastResult: FetchResult | undefined;
    let lastError: Error | undefined;
    let delayMs = this.baseDelayMs;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await fetch();
        lastResult = result;
        if (!RetryStrategy.shouldRetry(result.status)) {
          return result;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < this.maxAttempts) {
        const jitter = delayMs * this._random() * this.maxJitterFactor;
        await this._sleep(delayMs + jitter);
        delayMs *= this.multiplier;
      }
    }

    if (lastResult != null) {
      return lastResult;
    }
    throw lastError ?? new Error('all retry attempts failed');
  }
}
