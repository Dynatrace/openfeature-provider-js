import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderEvents } from '@openfeature/server-sdk';
import { DynatraceProvider } from './DynatraceProvider';
import { TEST_FLAG_JSON, VALID_SERVER_KEY } from './testFixtures';

const logger = {} as any;

function createMockFetch(handlers: {
  initialBody?: string;
  initialStatus?: number;
  onPoll?: (pollIndex: number) => { status: number; body?: string };
}): typeof fetch {
  let callCount = 0;
  return vi.fn(async () => {
    callCount++;
    if (callCount === 1) {
      const status = handlers.initialStatus ?? 200;
      return new Response(handlers.initialBody ?? TEST_FLAG_JSON, {
        status,
        headers: { ETag: '"v1"' },
      });
    }
    const pollIndex = callCount - 2;
    const poll = handlers.onPoll?.(pollIndex) ?? { status: 304 };
    return new Response(poll.body ?? null, {
      status: poll.status,
      headers: poll.body != null ? { ETag: `"v${callCount}"` } : {},
    });
  }) as typeof fetch;
}

describe('DynatraceProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('metadata.name is dynatrace', () => {
    expect(new DynatraceProvider(VALID_SERVER_KEY).metadata.name).toBe('dynatrace');
  });

  it('runsOn is server', () => {
    expect(new DynatraceProvider(VALID_SERVER_KEY).runsOn).toBe('server');
  });

  it('returns PROVIDER_NOT_READY before initialize', async () => {
    const provider = new DynatraceProvider(VALID_SERVER_KEY);
    const result = await provider.resolveBooleanEvaluation('my-bool', false, { targetingKey: 'u1' }, logger);
    expect(result.errorCode).toBe('PROVIDER_NOT_READY');
  });

  it('initializes and evaluates flags from CDN config', async () => {
    const provider = new DynatraceProvider(VALID_SERVER_KEY, {}, { fetch: createMockFetch({}) });

    await provider.initialize();

    const result = await provider.resolveBooleanEvaluation('my-bool', false, { targetingKey: 'u1' }, logger);
    expect(result.value).toBe(true);
    expect(provider.state).toBe('READY');

    await provider.onClose();
  });

  it('throws when initial CDN fetch fails', async () => {
    const provider = new DynatraceProvider(
      VALID_SERVER_KEY,
      {},
      {
        fetch: createMockFetch({ initialStatus: 404, initialBody: '' }),
      },
    );

    await expect(provider.initialize()).rejects.toThrow('initial CDN fetch returned HTTP 404');
  });

  it('throws when initial CDN body is empty', async () => {
    const provider = new DynatraceProvider(
      VALID_SERVER_KEY,
      {},
      {
        fetch: createMockFetch({ initialBody: '' }),
      },
    );

    await expect(provider.initialize()).rejects.toThrow('initial CDN response body was empty');
  });

  it('transitions to STALE when polling fails', async () => {
    const staleEvents: unknown[] = [];
    const provider = new DynatraceProvider(
      VALID_SERVER_KEY,
      {},
      {
        fetch: createMockFetch({
          onPoll: () => ({ status: 404 }),
        }),
        pollIntervalMs: 500,
        gracePeriodMs: 5_000,
      },
    );
    provider.events.addHandler(ProviderEvents.Stale, (details) => staleEvents.push(details));

    await provider.initialize();

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(100);

    expect(provider.state).toBe('STALE');
    expect(staleEvents.length).toBeGreaterThan(0);

    await provider.onClose();
  });

  it('transitions STALE to ERROR after grace period', async () => {
    const errorEvents: unknown[] = [];
    const provider = new DynatraceProvider(
      VALID_SERVER_KEY,
      {},
      {
        fetch: createMockFetch({
          onPoll: () => ({ status: 404 }),
        }),
        pollIntervalMs: 500,
        gracePeriodMs: 50,
      },
    );
    provider.events.addHandler(ProviderEvents.Error, (details) => errorEvents.push(details));

    await provider.initialize();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(50);

    expect(provider.state).toBe('ERROR');
    expect(errorEvents.length).toBeGreaterThan(0);

    await provider.onClose();
  });

  it('still evaluates flags while STALE', async () => {
    const provider = new DynatraceProvider(
      VALID_SERVER_KEY,
      {},
      {
        fetch: createMockFetch({
          onPoll: () => ({ status: 404 }),
        }),
        pollIntervalMs: 500,
        gracePeriodMs: 5_000,
      },
    );

    await provider.initialize();
    await vi.advanceTimersByTimeAsync(500);

    const result = await provider.resolveBooleanEvaluation('my-bool', false, { targetingKey: 'u1' }, logger);
    expect(result.value).toBe(true);
    expect(provider.state).toBe('STALE');

    await provider.onClose();
  });

  it('onClose is idempotent', async () => {
    const provider = new DynatraceProvider(VALID_SERVER_KEY, {}, { fetch: createMockFetch({}) });

    await provider.initialize();
    await provider.onClose();
    await provider.onClose();
    expect(provider.state).toBe('NOT_READY');
  });
});
