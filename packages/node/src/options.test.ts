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

  it('uses metricsUrl override', () => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, {
      metricsUrl: 'https://metrics.example.com/v1/metrics',
    });
    expect(opts.metricsUrl).toBe('https://metrics.example.com/v1/metrics');
  });

  it('rejects configOrigin with a path', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: 'https://cdn.example.com/server' })).toThrow(
      'configOrigin must not include a path',
    );
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

  it('rejects configOrigin with a query string', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: 'https://cdn.example.com?x=y' })).toThrow(
      'configOrigin must not include a query string',
    );
  });

  it('rejects configOrigin with a fragment', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: 'https://cdn.example.com#frag' })).toThrow(
      'configOrigin must not include a fragment',
    );
  });

  it.each([
    ['http://localhost:8080', 'http://localhost:8080'],
    ['https://cdn.example.com/', 'https://cdn.example.com'],
    ['HTTPS://CDN.Example.com', 'https://cdn.example.com'],
    // IPv6 literals must keep their brackets, or the URL is unusable.
    ['http://[::1]:8080', 'http://[::1]:8080'],
    ['https://[2001:db8::1]', 'https://[2001:db8::1]'],
  ])('normalises configOrigin %s', (origin, expected) => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: origin });
    expect(opts.cdnUrl).toBe(`${expected}/server/${VALID_SERVER_KEY}.json`);
  });

  it('rejects configOrigin with a non-http(s) scheme', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { configOrigin: 'ftp://cdn.example.com' })).toThrow(
      'configOrigin must use http or https',
    );
  });
});
