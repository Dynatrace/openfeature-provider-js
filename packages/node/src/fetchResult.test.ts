import { describe, it, expect } from 'vitest';
import { isNotModified, isRateLimited, isSkipped, isSuccess } from './fetchResult';

const base = { body: null, etag: null, lastModified: null, skipped: false };

describe('FetchResult helpers', () => {
  it('isNotModified is true for 304', () => {
    expect(isNotModified({ ...base, status: 304 })).toBe(true);
  });

  it('isRateLimited is true for 429', () => {
    expect(isRateLimited({ ...base, status: 429 })).toBe(true);
  });

  it('isSuccess is true for 2xx', () => {
    expect(isSuccess({ ...base, status: 200, body: '{}' })).toBe(true);
  });

  it('isSkipped is true only when no request was made', () => {
    expect(isSkipped({ ...base, status: 0, skipped: true })).toBe(true);
    expect(isSkipped({ ...base, status: 304 })).toBe(false);
  });

  it('a skipped result is neither not-modified, rate-limited, nor success', () => {
    const skipped = { ...base, status: 0, skipped: true };
    expect(isNotModified(skipped)).toBe(false);
    expect(isRateLimited(skipped)).toBe(false);
    expect(isSuccess(skipped)).toBe(false);
  });
});
