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

  it('uses metricsOrigin override', () => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, {
      metricsOrigin: 'https://metrics.example.com',
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

  it('rejects explicit null metricsOrigin', () => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, { metricsOrigin: null as unknown as string })).toThrow(
      'metricsOrigin must not be null or blank',
    );
  });

  it('rejects metricsOrigin with a path', () => {
    expect(() =>
      resolveProviderOptions(VALID_SERVER_KEY, { metricsOrigin: 'https://metrics.example.com/v1/metrics' }),
    ).toThrow('metricsOrigin must not include a path');
  });
});

describe('resolveProviderOptions env vars', () => {
  const envOf =
    (vars: Record<string, string>) =>
    (name: string): string | undefined =>
      vars[name];

  it('reads each option from its env var when not set in code', () => {
    const opts = resolveProviderOptions(
      undefined,
      {},
      envOf({
        DT_FM_SDK_KEY: VALID_SERVER_KEY,
        DT_FM_CONFIG_ORIGIN: 'https://cdn.example.com',
        DT_FM_METRICS_ORIGIN: 'https://metrics.example.com',
        DT_FM_SSE_DISABLED: 'true',
      }),
    );
    expect(opts.sdkKey).toBe(VALID_SERVER_KEY);
    expect(opts.cdnUrl).toBe(`https://cdn.example.com/server/${VALID_SERVER_KEY}.json`);
    expect(opts.metricsUrl).toBe('https://metrics.example.com/v1/metrics');
    expect(opts.sseEnabled).toBe(false);
  });

  it.each([
    ['true', false],
    [' TRUE ', false],
    ['False', true],
  ])('parses DT_FM_SSE_DISABLED=%j', (value, sseEnabled) => {
    const opts = resolveProviderOptions(VALID_SERVER_KEY, {}, envOf({ DT_FM_SSE_DISABLED: value }));
    expect(opts.sseEnabled).toBe(sseEnabled);
  });

  it('prefers code values over env vars', () => {
    const otherKey = 'dt01.server_eu_zz3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';
    const opts = resolveProviderOptions(
      otherKey,
      { configOrigin: 'https://cdn.code.com', metricsOrigin: 'https://metrics.code.com', disableSse: false },
      envOf({
        DT_FM_SDK_KEY: VALID_SERVER_KEY,
        DT_FM_CONFIG_ORIGIN: 'https://cdn.env.com',
        DT_FM_METRICS_ORIGIN: 'https://metrics.env.com',
        DT_FM_SSE_DISABLED: 'true',
      }),
    );
    expect(opts.sdkKey).toBe(otherKey);
    expect(opts.cdnUrl).toBe(`https://cdn.code.com/server/${otherKey}.json`);
    expect(opts.metricsUrl).toBe('https://metrics.code.com/v1/metrics');
    // explicit false in code beats env true
    expect(opts.sseEnabled).toBe(true);
  });

  it('treats empty and blank env values as unset', () => {
    const opts = resolveProviderOptions(
      VALID_SERVER_KEY,
      {},
      envOf({ DT_FM_CONFIG_ORIGIN: '', DT_FM_METRICS_ORIGIN: '   ', DT_FM_SSE_DISABLED: ' ' }),
    );
    expect(opts.cdnUrl).toBe(`https://cdn.us.fm.dynatrace.com/server/${VALID_SERVER_KEY}.json`);
    expect(opts.metricsUrl).toBe('https://metrics.us.fm.dynatrace.com/v1/metrics');
    expect(opts.sseEnabled).toBe(true);
  });

  it.each([
    [{ DT_FM_CONFIG_ORIGIN: 'https://cdn.example.com/server' }, 'DT_FM_CONFIG_ORIGIN must not include a path'],
    [{ DT_FM_METRICS_ORIGIN: 'ftp://metrics.example.com' }, 'DT_FM_METRICS_ORIGIN must use http or https'],
    [{ DT_FM_SSE_DISABLED: 'yes' }, 'DT_FM_SSE_DISABLED must be "true" or "false"'],
  ])('rejects invalid env value %j', (vars, message) => {
    expect(() => resolveProviderOptions(VALID_SERVER_KEY, {}, envOf(vars))).toThrow(message);
  });

  it('rejects an invalid DT_FM_SDK_KEY without leaking it', () => {
    const webKey = 'dt01.web_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';
    expect(() => resolveProviderOptions(undefined, {}, envOf({ DT_FM_SDK_KEY: webKey }))).toThrow(
      /Invalid SDK key format.*DT_FM_SDK_KEY/,
    );
    expect(() => resolveProviderOptions(undefined, {}, envOf({ DT_FM_SDK_KEY: webKey }))).not.toThrow(
      '03ee0ef7cd4244bfb8b71fea8f783f53',
    );
  });

  it.each(['', '   '])('treats a blank code SDK key %j as unset', (codeKey) => {
    const opts = resolveProviderOptions(codeKey, {}, envOf({ DT_FM_SDK_KEY: VALID_SERVER_KEY }));
    expect(opts.sdkKey).toBe(VALID_SERVER_KEY);
  });

  it.each([
    [undefined, {}],
    [undefined, { DT_FM_SDK_KEY: '  ' }],
    ['  ', {}],
  ])('requires an SDK key from code or env (code %j, env %j)', (codeKey, vars) => {
    expect(() => resolveProviderOptions(codeKey, {}, envOf(vars))).toThrow('DT_FM_SDK_KEY');
  });
});
