import { describe, it, expect, vi } from 'vitest';
import { RetryStrategy } from './retry';

describe('RetryStrategy', () => {
  it('returns immediately on success', async () => {
    const strategy = new RetryStrategy({ sleep: () => {} });
    const result = await strategy.execute(async () => ({
      status: 200,
      body: '{}',
      etag: null,
      lastModified: null,
    }));
    expect(result.status).toBe(200);
  });

  it('retries on 5xx then succeeds', async () => {
    let attempts = 0;
    const strategy = new RetryStrategy({ sleep: () => {}, random: () => 0 });
    const result = await strategy.execute(async () => {
      attempts++;
      return attempts < 2
        ? { status: 503, body: null, etag: null, lastModified: null }
        : { status: 200, body: '{}', etag: null, lastModified: null };
    });
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('does not retry on 4xx', async () => {
    let attempts = 0;
    const strategy = new RetryStrategy({ sleep: () => {} });
    const result = await strategy.execute(async () => {
      attempts++;
      return { status: 404, body: null, etag: null, lastModified: null };
    });
    expect(result.status).toBe(404);
    expect(attempts).toBe(1);
  });

  it('throws without attempting when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();
    const strategy = new RetryStrategy({ sleep: () => {} });

    await expect(strategy.execute(fetch, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rethrows an AbortError from fetch instead of retrying', async () => {
    let attempts = 0;
    const strategy = new RetryStrategy({ sleep: () => {} });

    const pending = strategy.execute(async () => {
      attempts++;
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(attempts).toBe(1);
  });

  it('stops waiting when the signal aborts during backoff', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const strategy = new RetryStrategy({ baseDelayMs: 10_000, random: () => 0 });

    const pending = strategy.execute(async () => {
      attempts++;
      // Abort once the backoff is already waiting, so the sleep has to settle from its
      // abort listener rather than from the already-aborted precheck.
      setTimeout(() => controller.abort(), 0);
      return { status: 503, body: null, etag: null, lastModified: null };
    }, controller.signal);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(attempts).toBe(1);
  });

  it('shouldRetry identifies 5xx', () => {
    expect(RetryStrategy.shouldRetry(500)).toBe(true);
    expect(RetryStrategy.shouldRetry(404)).toBe(false);
  });
});
