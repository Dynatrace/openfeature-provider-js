import { describe, it, expect } from 'vitest';
import { isNotModified, isRateLimited, isSuccess } from './fetchResult';

describe('FetchResult helpers', () => {
  it('isNotModified is true for 304', () => {
    expect(isNotModified({ status: 304, body: null, etag: null, lastModified: null })).toBe(true);
  });

  it('isRateLimited is true for 429', () => {
    expect(isRateLimited({ status: 429, body: null, etag: null, lastModified: null })).toBe(true);
  });

  it('isSuccess is true for 2xx', () => {
    expect(isSuccess({ status: 200, body: '{}', etag: null, lastModified: null })).toBe(true);
  });
});
