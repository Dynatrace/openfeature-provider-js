import { describe, it, expect } from 'vitest';
import { buildCdnUrl, buildMetricsUrl, parseSdkKey, publicKey } from './sdkKey';
import { VALID_SERVER_KEY, VALID_WEB_KEY } from './testKeys';

describe('parseSdkKey', () => {
  it('parses a valid web key', () => {
    const parsed = parseSdkKey(VALID_WEB_KEY, 'web');
    expect(parsed.platform).toBe('web');
    expect(parsed.geo).toBe('us');
    expect(parsed.key).toBe(VALID_WEB_KEY);
  });

  it('parses a valid server key without platform filter', () => {
    const parsed = parseSdkKey(VALID_SERVER_KEY);
    expect(parsed.platform).toBe('server');
    expect(parsed.geo).toBe('us');
  });

  it('trims surrounding whitespace', () => {
    const parsed = parseSdkKey(`  ${VALID_WEB_KEY}  `, 'web');
    expect(parsed.key).toBe(VALID_WEB_KEY);
  });

  it('rejects blank keys', () => {
    expect(() => parseSdkKey('   ')).toThrow('[DynatraceProvider] key must not be null or blank');
  });

  it('rejects a server key when web platform is expected', () => {
    expect(() => parseSdkKey(VALID_SERVER_KEY, 'web')).toThrow(
      "[DynatraceProvider] Invalid SDK key format (public: 'dt01.server_us_ab3xy9kp2q').",
    );
    expect(() => parseSdkKey(VALID_SERVER_KEY, 'web')).toThrow(
      expect.not.stringContaining('03ee0ef7cd4244bfb8b71fea8f783f53'),
    );
  });

  it('rejects malformed keys with a public segment in the error', () => {
    expect(() => parseSdkKey('not-a-key')).toThrow("public: '<redacted>'");
  });
});

describe('publicKey', () => {
  it('returns everything before the last dot', () => {
    expect(publicKey(VALID_WEB_KEY)).toBe('dt01.web_us_ab3xy9kp2q');
  });

  it('returns redacted when no dot is present', () => {
    expect(publicKey('invalid')).toBe('<redacted>');
  });

  it('returns redacted for dotted strings that are not SDK keys', () => {
    expect(publicKey('foo.bar.baz')).toBe('<redacted>');
    expect(publicKey('dt01.notweb_us_ab3xy9kp2q.secret_hash')).toBe('<redacted>');
  });
});

describe('buildMetricsUrl', () => {
  it('derives the metrics URL from geo', () => {
    expect(buildMetricsUrl('eu')).toBe('https://metrics.eu.fm.dynatrace.com/v1/metrics');
  });
});

describe('buildCdnUrl', () => {
  it('derives the production CDN URL from geo and platform', () => {
    expect(buildCdnUrl(VALID_SERVER_KEY, 'server', 'us')).toBe(
      `https://cdn.us.fm.dynatrace.com/server/${VALID_SERVER_KEY}.json`,
    );
  });

  it('uses configOrigin override when provided', () => {
    expect(buildCdnUrl(VALID_SERVER_KEY, 'server', 'us', 'https://cdn.eu.fm.dynatracelabs.com')).toBe(
      `https://cdn.eu.fm.dynatracelabs.com/server/${VALID_SERVER_KEY}.json`,
    );
  });
});
