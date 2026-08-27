import { describe, it, expect } from 'vitest';
import { METRICS_INGEST_PATH, metricsUrlFromOrigin, validateOrigin } from './origin';

describe('validateOrigin', () => {
  it('returns a canonical origin without a trailing slash', () => {
    expect(validateOrigin('https://metrics.example.com', 'metricsOrigin')).toBe('https://metrics.example.com');
    expect(validateOrigin('https://metrics.example.com/', 'metricsOrigin')).toBe('https://metrics.example.com');
  });

  it('keeps an explicit default port', () => {
    expect(validateOrigin('https://metrics.example.com:443', 'metricsOrigin')).toBe('https://metrics.example.com:443');
  });

  it('rejects a path', () => {
    for (const origin of [
      'https://metrics.example.com/v1/metrics',
      'https://metrics.example.com//',
      'https://metrics.example.com/..',
    ]) {
      expect(() => validateOrigin(origin, 'metricsOrigin')).toThrow('metricsOrigin must not include a path');
    }
  });
});

describe('metricsUrlFromOrigin', () => {
  it('appends the ingest path to a canonical origin', () => {
    expect(metricsUrlFromOrigin('https://metrics.example.com')).toBe(
      `https://metrics.example.com${METRICS_INGEST_PATH}`,
    );
  });

  it('rejects a blank or null origin', () => {
    expect(() => metricsUrlFromOrigin('   ')).toThrow('metricsOrigin must not be null or blank');
    expect(() => metricsUrlFromOrigin(null)).toThrow('metricsOrigin must not be null or blank');
  });
});
