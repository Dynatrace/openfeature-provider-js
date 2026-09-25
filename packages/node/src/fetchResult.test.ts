import { describe, it, expect } from 'vitest';
import { isNotModified, isRateLimited, isSuccess } from './fetchResult';

const base = { body: null, etag: null, lastModified: null };

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
});
