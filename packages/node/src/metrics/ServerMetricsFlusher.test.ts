import { describe, it, expect, vi } from 'vitest';
import { MetricsAggregator } from '../../../shared/src/metrics/aggregator.js';
import { FAILED_CAPACITY_RETRY_COOLDOWN_MS, MAX_SEALED_BATCHES, ServerMetricsFlusher } from './ServerMetricsFlusher.js';
import { VALID_SERVER_KEY } from '../testFixtures.js';

const FLUSH_OPTS = {
  sdkKey: VALID_SERVER_KEY,
  metricsUrl: 'https://metrics.us.fm.dynatrace.com/v1/metrics',
  flushIntervalMs: 300_000,
  softCapDistinctFlags: 1,
  sdkVersion: '1.2.3',
  providerName: 'dynatrace',
};

function createMetricsFetch(statuses: number[]): typeof fetch {
  let callIndex = 0;
  return vi.fn(async () => {
    const status = statuses[Math.min(callIndex, statuses.length - 1)] ?? 202;
    callIndex++;
    return new Response(null, { status });
  }) as typeof fetch;
}

async function waitForWorker(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function triggerAndWait(flusher: ServerMetricsFlusher): Promise<void> {
  flusher.triggerFlush();
  await waitForWorker();
}

describe('ServerMetricsFlusher', () => {
  it('delivers metrics again after a shutdown and a restart', async () => {
    const fetch = createMetricsFetch([202]);
    const aggregator = new MetricsAggregator();
    aggregator.setVersion('1741780800');

    // The provider reuses one flusher across initialize/onClose/initialize.
    const flusher = new ServerMetricsFlusher({ aggregator, fetch, ...FLUSH_OPTS });
    flusher.start();
    await flusher.shutdown();
    expect(fetch).toHaveBeenCalledTimes(0);

    flusher.start();
    aggregator.record('header-redesign', 'control', 'targeting_match', '', 1_741_780_820);
    await flusher.shutdown();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(String(init?.body)).evaluations[0].flagKey).toBe('header-redesign');
  });

  it('posts documented JSON payload on shutdown', async () => {
    const fetch = createMetricsFetch([202]);
    const aggregator = new MetricsAggregator();
    aggregator.setVersion('1741780800');
    aggregator.record('header-redesign', 'control', 'targeting_match', '', 1_741_780_820);
    aggregator.record('deleted-flag', '__default__', 'error', 'flag_not_found', 1_741_780_820);

    const flusher = new ServerMetricsFlusher({ aggregator, fetch, ...FLUSH_OPTS });
    await flusher.shutdown();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.version).toBe('1741780800');
    expect(body.sdkType).toBe('server');
    expect(body.sdkVersion).toBe('1.2.3');
    expect(body.providerName).toBe('dynatrace');
    expect(body.evaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          flagKey: 'header-redesign',
          variant: 'control',
          evaluationReason: 'targeting_match',
          timestampSec: 1_741_780_820,
          count: 1,
        }),
        expect.objectContaining({
          flagKey: 'deleted-flag',
          variant: '__default__',
          evaluationReason: 'error',
          errorCode: 'flag_not_found',
          timestampSec: 1_741_780_820,
          count: 1,
        }),
      ]),
    );
    expect(init?.headers?.Authorization).toBe(`Bearer ${VALID_SERVER_KEY}`);
  });

  it('triggerFlush delivers sealed batch asynchronously', async () => {
    const fetch = createMetricsFetch([202]);
    const aggregator = new MetricsAggregator();
    aggregator.setVersion('1741780800');
    aggregator.record('header-redesign', 'control', 'targeting_match', '', 1_741_780_820);

    const flusher = new ServerMetricsFlusher({ aggregator, fetch, ...FLUSH_OPTS });
    flusher.start();

    const sealed = aggregator.drain();
    flusher.enqueueSealedBatch(sealed);
    await triggerAndWait(flusher);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(aggregator.flagCount()).toBe(0);

    await flusher.shutdown();
  });

  it('requeues batch on 500 and retries on triggerFlush', async () => {
    const fetch = createMetricsFetch([500, 202]);
    const aggregator = new MetricsAggregator();
    aggregator.setVersion('1741780800');
    aggregator.record('header-redesign', 'control', 'targeting_match', '', 1_741_780_820);

    const flusher = new ServerMetricsFlusher({ aggregator, fetch, ...FLUSH_OPTS });
    flusher.start();
    flusher.onRecord();
    await waitForWorker();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(aggregator.flagCount()).toBe(0);

    await triggerAndWait(flusher);

    expect(fetch).toHaveBeenCalledTimes(2);
    const [, retryInit] = (fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(JSON.parse(String(retryInit?.body)).version).toBe('1741780800');

    await flusher.shutdown();
  });

  it('drops batch on HTTP 400 and continues with next sealed batch', async () => {
    const fetch = createMetricsFetch([400, 202]);
    const first = new MetricsAggregator();
    first.setVersion('1741780800');
    first.record('bad-payload-flag', 'on', 'static', '', 1_741_780_820, '1741780800');

    const second = new MetricsAggregator();
    second.setVersion('1741780900');
    second.record('next-flag', 'on', 'static', '', 1_741_780_910, '1741780900');

    const flusher = new ServerMetricsFlusher({
      aggregator: new MetricsAggregator(),
      fetch,
      ...FLUSH_OPTS,
      softCapDistinctFlags: 1_000,
    });
    flusher.enqueueSealedBatch(first.drain());
    flusher.enqueueSealedBatch(second.drain());
    await triggerAndWait(flusher);

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.body));
    const secondBody = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body));
    expect(firstBody.evaluations[0].flagKey).toBe('bad-payload-flag');
    expect(secondBody.evaluations[0].flagKey).toBe('next-flag');

    await flusher.shutdown();
  });

  it('applies cooldown to capacity-triggered flushes after failure', async () => {
    let nowMs = 0;
    const fetch = createMetricsFetch([500, 202]);
    const aggregator = new MetricsAggregator();
    aggregator.setVersion('1741780800');

    const flusher = new ServerMetricsFlusher({
      aggregator,
      fetch,
      ...FLUSH_OPTS,
      now: () => nowMs,
    });
    flusher.start();

    aggregator.record('flag-a', 'on', 'static', '', 1_741_780_820);
    flusher.onRecord();
    await waitForWorker();
    expect(fetch).toHaveBeenCalledTimes(1);

    flusher.onRecord();
    await waitForWorker();
    expect(fetch).toHaveBeenCalledTimes(1);

    nowMs = FAILED_CAPACITY_RETRY_COOLDOWN_MS;
    await triggerAndWait(flusher);
    expect(fetch).toHaveBeenCalledTimes(2);

    await flusher.shutdown();
  });

  it('keeps a failed live batch and drops the newest seal when the queue filled during the post', async () => {
    let callIndex = 0;
    const flusherRef: { current?: ServerMetricsFlusher } = {};
    const fetch = vi.fn(async () => {
      callIndex++;
      if (callIndex === 1) {
        // Config rotations land while the live batch is still on the wire.
        for (let i = 0; i < MAX_SEALED_BATCHES; i++) {
          const batchAgg = new MetricsAggregator();
          batchAgg.setVersion(String(i));
          batchAgg.record(`sealed-${i}`, 'on', 'static', '', 1_741_780_820 + i);
          flusherRef.current?.enqueueSealedBatch(batchAgg.drain());
        }
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    const aggregator = new MetricsAggregator();
    aggregator.setVersion('live');
    aggregator.record('live-flag', 'on', 'static', '', 1_741_780_820);
    const flusher = new ServerMetricsFlusher({ aggregator, fetch, ...FLUSH_OPTS, softCapDistinctFlags: 1_000 });
    flusherRef.current = flusher;

    await triggerAndWait(flusher);
    await triggerAndWait(flusher);

    const bodies = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((call) =>
      String((call[1] as RequestInit).body),
    );
    // The retry keeps the head of the queue, and the cap holds by dropping the newest seal.
    expect(bodies[1]).toContain('live-flag');
    expect(bodies.filter((body) => body.includes('sealed-')).length).toBe(MAX_SEALED_BATCHES - 1);
    expect(bodies.some((body) => body.includes(`sealed-${MAX_SEALED_BATCHES - 1}`))).toBe(false);

    await flusher.shutdown();
  });

  it('drops incoming sealed batch when queue is full', async () => {
    const fetch = createMetricsFetch(Array(MAX_SEALED_BATCHES + 1).fill(202));
    const aggregator = new MetricsAggregator();
    const flusher = new ServerMetricsFlusher({
      aggregator,
      fetch,
      ...FLUSH_OPTS,
      softCapDistinctFlags: 1_000,
    });

    for (let i = 0; i < MAX_SEALED_BATCHES + 1; i++) {
      const batchAgg = new MetricsAggregator();
      batchAgg.setVersion(String(i));
      batchAgg.record(`flag-${i}`, 'on', 'static', '', 1_741_780_820 + i);
      flusher.enqueueSealedBatch(batchAgg.drain());
    }

    await triggerAndWait(flusher);
    expect(fetch).toHaveBeenCalledTimes(MAX_SEALED_BATCHES);

    await flusher.shutdown();
  });
});
