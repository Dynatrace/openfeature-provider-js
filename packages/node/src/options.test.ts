import { describe, it, expect } from 'vitest';
import { resolveProviderOptions } from './options';

const VALID_SERVER_KEY = 'dt01.server_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';

describe('resolveProviderOptions', () => {
  it('derives CDN and metrics URLs from a server key', () => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY);
    expect(opts.cdnUrl).toBe(`https://cdn.us.fm.dynatrace.com/server/${VALID_SERVER_KEY}.json`);
    expect(opts.metricsUrl).toBe('https://metrics.us.fm.dynatrace.com/v1/metrics');
    expect(opts.publicKey).toBe('dt01.server_us_ab3xy9kp2q');
  });

  it('rejects web keys', () => {
    expect(() => resolveProviderOptions('dt01.web_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a')).toThrow(
      '[DynatraceProvider] Invalid SDK key format',
    );
  });

  it('uses configOrigin override', () => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, {
      configOrigin: 'https://cdn.eu.fm.dynatracelabs.com',
    });
    expect(opts.cdnUrl).toBe(`https://cdn.eu.fm.dynatracelabs.com/server/${VALID_SERVER_KEY}.json`);
  });

  it('keeps an explicit default port on configOrigin', () => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, {
      configOrigin: 'https://cdn.example.com:443',
    });
    expect(opts.cdnUrl).toBe(`https://cdn.example.com:443/server/${VALID_SERVER_KEY}.json`);
  });

  it('uses metricsUrl override', () => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, {
      metricsUrl: 'https://metrics.example.com/v1/metrics',
    });
    expect(opts.metricsUrl).toBe('https://metrics.example.com/v1/metrics');
  });

  it('rejects configOrigin with a path', () => {
    for (const origin of [
      'https://cdn.example.com/server',
      'https://cdn.example.com//',
      'https://cdn.example.com/..',
    ]) {
      expect(() => resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: origin })).toThrow(
        'configOrigin must not include a path',
      );
    }
  });

  it('rejects explicit null configOrigin', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: null as unknown as string })).toThrow(
      'configOrigin must not be null or blank',
    );
  });

  it('rejects explicit null metricsUrl', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { metricsUrl: null as unknown as string })).toThrow(
      'metricsUrl must not be null or blank',
    );
  });
});
