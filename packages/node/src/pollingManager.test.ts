import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { REQUEST_TIMEOUT_MS } from './cdnFetcher';
import { DEFAULT_POLL_INTERVAL_MS, PollingManager, type PollingCallbacks } from './pollingManager';
import type { FetchResult } from './fetchResult';
import { BASE_DELAY_MS, MAX_ATTEMPTS, MAX_JITTER_FACTOR, MULTIPLIER } from './retry';

function makeCallbacks(overrides: Partial<PollingCallbacks> = {}): PollingCallbacks {
  return {
    fetchFlags: vi.fn(async (): Promise<FetchResult> => ({ status: 304, body: null, etag: null, lastModified: null })),
    storeFlags: vi.fn((): string[] => []),
    commitFetch: vi.fn(),
    emitChange: vi.fn(),
    emitSuccess: vi.fn(),
    emitFailure: vi.fn(),
    ...overrides,
  };
}

describe('fetch duration bound', () => {
  // fm-knowledge-base providers.md 2.1 states this as an invariant, not a coincidence: any
  // change to the timeout, the attempt count or the backoff has to preserve it, because it
  // is what keeps two polls from ever being in flight at once.
  it('keeps the worst-case fetch shorter than the shortest poll interval', () => {
    let backoffMs = 0;
    let delayMs = BASE_DELAY_MS;
    for (let retry = 1; retry < MAX_ATTEMPTS; retry++) {
      backoffMs += delayMs * (1 + MAX_JITTER_FACTOR);
      delayMs *= MULTIPLIER;
    }

    const worstCaseMs = MAX_ATTEMPTS * REQUEST_TIMEOUT_MS + backoffMs;

    expect(worstCaseMs).toBeLessThan(DEFAULT_POLL_INTERVAL_MS);
  });
});

describe('PollingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips a tick that finds a fetch already in flight and emits nothing', async () => {
    let settle: (value: FetchResult) => void;
    const fetchFlags = vi.fn(
      () =>
        new Promise<FetchResult>((resolve) => {
          settle = resolve;
        }),
    );
    const callbacks = makeCallbacks({ fetchFlags });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(35);

    // Three intervals elapsed, but the first fetch never finished, so the later ticks were
    // skipped rather than starting a second concurrent fetch.
    expect(fetchFlags).toHaveBeenCalledTimes(1);
    // A skipped tick learned nothing, so it emits neither success (which would reset the
    // staleness grace timer) nor failure.
    expect(callbacks.emitSuccess).not.toHaveBeenCalled();
    expect(callbacks.emitFailure).not.toHaveBeenCalled();

    settle!({ status: 304, body: null, etag: null, lastModified: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.emitSuccess).toHaveBeenCalledTimes(1);

    // The slot is free again, so polling resumes on the next tick.
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchFlags).toHaveBeenCalledTimes(2);

    manager.stop();
  });

  it('aborts the in-flight fetch on stop', async () => {
    const fetchFlags = vi.fn(
      (signal: AbortSignal) =>
        new Promise<FetchResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const callbacks = makeCallbacks({ fetchFlags });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(15);
    manager.stop();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchFlags).toHaveBeenCalledTimes(1);
    expect(callbacks.emitFailure).not.toHaveBeenCalled();
  });

  it('emits success on 304', async () => {
    const callbacks = makeCallbacks();
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(35);
    manager.stop();

    expect(callbacks.emitSuccess).toHaveBeenCalled();
    expect(callbacks.emitChange).not.toHaveBeenCalled();
    expect(callbacks.emitFailure).not.toHaveBeenCalled();
  });

  it('emits success without change when storeFlags returns no keys', async () => {
    const callbacks = makeCallbacks({
      fetchFlags: vi.fn(async () => ({
        status: 200,
        body: '{"flags":{}}',
        etag: '"abc"',
        lastModified: null,
      })),
      storeFlags: vi.fn((): string[] => []),
    });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(25);
    manager.stop();

    expect(callbacks.emitSuccess).toHaveBeenCalled();
    expect(callbacks.emitChange).not.toHaveBeenCalled();
  });

  it('emits change when storeFlags returns keys', async () => {
    const callbacks = makeCallbacks({
      fetchFlags: vi.fn(async () => ({
        status: 200,
        body: '{"flags":{}}',
        etag: '"abc"',
        lastModified: null,
      })),
      storeFlags: vi.fn((): string[] => ['flag-a']),
    });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(25);
    manager.stop();

    expect(callbacks.emitSuccess).toHaveBeenCalled();
    expect(callbacks.emitChange).toHaveBeenCalledWith(['flag-a']);
  });

  it('ignores 429 without emitting failure', async () => {
    const callbacks = makeCallbacks({
      fetchFlags: vi.fn(async () => ({ status: 429, body: null, etag: null, lastModified: null })),
    });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(25);
    manager.stop();

    expect(callbacks.emitFailure).not.toHaveBeenCalled();
    expect(callbacks.emitSuccess).not.toHaveBeenCalled();
  });

  it('emits failure on non-success responses', async () => {
    const callbacks = makeCallbacks({
      fetchFlags: vi.fn(async () => ({ status: 503, body: null, etag: null, lastModified: null })),
    });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(25);
    manager.stop();

    expect(callbacks.emitFailure).toHaveBeenCalledWith('HTTP 503');
    expect(callbacks.emitSuccess).not.toHaveBeenCalled();
  });

  it('stop is idempotent', () => {
    const callbacks = makeCallbacks();
    const manager = new PollingManager(callbacks, 100);

    manager.start();
    manager.stop();
    manager.stop();
  });

  it('stop aborts an in-flight poll', async () => {
    let resolveBlocked: () => void;
    const blocked = new Promise<void>((resolve) => {
      resolveBlocked = resolve;
    });

    const callbacks = makeCallbacks({
      fetchFlags: vi.fn(async (signal) => {
        await blocked;
        if (signal.aborted) {
          throw new DOMException('The operation was aborted', 'AbortError');
        }
        return { status: 304, body: null, etag: null, lastModified: null };
      }),
    });

    const manager = new PollingManager(callbacks, 10);
    manager.start();
    await vi.advanceTimersByTimeAsync(10);
    manager.stop();
    resolveBlocked!();
    await vi.advanceTimersByTimeAsync(0);

    expect(callbacks.emitSuccess).not.toHaveBeenCalled();
    expect(callbacks.emitFailure).not.toHaveBeenCalled();
  });

  it('passes an AbortSignal to fetchFlags', async () => {
    const callbacks = makeCallbacks({
      fetchFlags: vi.fn(async (signal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return { status: 304, body: null, etag: null, lastModified: null };
      }),
    });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(10);
    manager.stop();

    expect(callbacks.fetchFlags).toHaveBeenCalled();
  });
});
