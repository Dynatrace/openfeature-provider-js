import { describe, it, expect } from 'vitest';
import { RetryStrategy } from './retry';

describe('RetryStrategy', () => {
  it('returns immediately on success', async () => {
    const strategy = new RetryStrategy({ sleep: () => {} });
    const result = await strategy.execute(async () => ({
      status: 200,
      body: '{}',
      etag: null,
      lastModified: null,
      skipped: false,
    }));
    expect(result.status).toBe(200);
  });

  it('retries on 5xx then succeeds', async () => {
    let attempts = 0;
    const strategy = new RetryStrategy({ sleep: () => {}, random: () => 0 });
    const result = await strategy.execute(async () => {
      attempts++;
      return attempts < 2
        ? { status: 503, body: null, etag: null, lastModified: null, skipped: false }
        : { status: 200, body: '{}', etag: null, lastModified: null, skipped: false };
    });
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
  });

  it('does not retry on 4xx', async () => {
    let attempts = 0;
    const strategy = new RetryStrategy({ sleep: () => {} });
    const result = await strategy.execute(async () => {
      attempts++;
      return { status: 404, body: null, etag: null, lastModified: null, skipped: false };
    });
    expect(result.status).toBe(404);
    expect(attempts).toBe(1);
  });

  it('shouldRetry identifies 5xx', () => {
    expect(RetryStrategy.shouldRetry(500)).toBe(true);
    expect(RetryStrategy.shouldRetry(404)).toBe(false);
  });
});
