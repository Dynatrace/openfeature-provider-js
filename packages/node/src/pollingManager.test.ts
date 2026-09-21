import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PollingManager, type PollingCallbacks } from './pollingManager';
import type { FetchResult } from './fetchResult';

function makeCallbacks(overrides: Partial<PollingCallbacks> = {}): PollingCallbacks {
  return {
    fetchFlags: vi.fn(async (): Promise<FetchResult> => ({ status: 304, body: null, etag: null, lastModified: null })),
    storeFlags: vi.fn(async () => [] as string[]),
    emitChange: vi.fn(),
    emitSuccess: vi.fn(),
    emitFailure: vi.fn(),
    ...overrides,
  };
}

describe('PollingManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts a fresh fetch every tick and emits nothing for superseded polls', async () => {
    const fetchFlags = vi.fn(
      (signal: AbortSignal) =>
        new Promise<FetchResult>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const callbacks = makeCallbacks({ fetchFlags });
    const manager = new PollingManager(callbacks, 10);

    manager.start();
    await vi.advanceTimersByTimeAsync(35);
    manager.stop();

    // Cadence is anchored to request initiation, so every elapsed interval starts a fetch
    // even though the previous one never completed.
    expect(fetchFlags).toHaveBeenCalledTimes(3);
    // A superseded poll carries no information, so it must emit neither success (which
    // would reset the staleness grace timer) nor failure.
    expect(callbacks.emitSuccess).not.toHaveBeenCalled();
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
      storeFlags: vi.fn(async () => []),
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
      storeFlags: vi.fn(async () => ['flag-a']),
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
