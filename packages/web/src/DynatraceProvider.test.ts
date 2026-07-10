import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClientProviderEvents } from '@openfeature/web-sdk';
import { DynatraceProvider, type DynatraceProviderOptions } from './DynatraceProvider';

// vi.hoisted ensures mockInner is defined before the hoisted vi.mock() factory runs.
const mockInner = vi.hoisted(() => ({
  metadata: { name: 'ofrep-web' },
  events: undefined as unknown,
  initialize: vi.fn(),
  onContextChange: vi.fn(),
  onClose: vi.fn(),
  resolveBooleanEvaluation: vi.fn(),
  resolveStringEvaluation: vi.fn(),
  resolveNumberEvaluation: vi.fn(),
  resolveObjectEvaluation: vi.fn(),
}));

vi.mock('@openfeature/ofrep-web-provider', () => ({
  // Regular function (not arrow) so it can be called with `new`.
  OFREPWebProvider: vi.fn(function () {
    return mockInner;
  }),
}));

const { OFREPWebProvider } = await import('@openfeature/ofrep-web-provider');

// Realistic keys: {token}.web_{geo}_{publicRandom}.{secret}_{sha1}
const VALID_KEY_US = 'dt01.web_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';
const VALID_KEY_EU = 'dt01.web_eu_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';

const ctx = { targetingKey: 'user-1' };
const logger: any = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('static properties', () => {
  it('metadata.name is "dynatrace"', () => {
    expect(new DynatraceProvider(VALID_KEY_US).metadata.name).toBe('dynatrace');
  });

  it('runsOn is "client"', () => {
    expect(new DynatraceProvider(VALID_KEY_US).runsOn).toBe('client');
  });
});

describe('constructor', () => {
  it('derives the US OFREP URL from a US sdkKey', () => {
    new DynatraceProvider(VALID_KEY_US);
    expect(OFREPWebProvider).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://ofrep.us.fm.dynatrace.com' }),
    );
  });

  it('derives the EU OFREP URL from an EU sdkKey', () => {
    new DynatraceProvider(VALID_KEY_EU);
    expect(OFREPWebProvider).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://ofrep.eu.fm.dynatrace.com' }),
    );
  });

  it('sends the full sdkKey as a Bearer Authorization header', () => {
    new DynatraceProvider(VALID_KEY_US);
    expect(OFREPWebProvider).toHaveBeenCalledWith(
      expect.objectContaining({ headers: [['Authorization', `Bearer ${VALID_KEY_US}`]] }),
    );
  });

  it('trims surrounding whitespace from the sdkKey before sending Authorization', () => {
    new DynatraceProvider(`  ${VALID_KEY_US}  `);
    expect(OFREPWebProvider).toHaveBeenCalledWith(
      expect.objectContaining({ headers: [['Authorization', `Bearer ${VALID_KEY_US}`]] }),
    );
  });

  it('uses a custom apiOrigin instead of deriving from the sdkKey', () => {
    new DynatraceProvider(VALID_KEY_US, { apiOrigin: 'https://custom.example.com' });
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://custom.example.com' }));
  });

  it('passes a custom metricsUrl through to the metrics hook', () => {
    const provider = new DynatraceProvider(VALID_KEY_US, { metricsUrl: 'https://my-metrics.example.com/v1/metrics' });
    expect((provider as any)._metricsHook.metricsUrl).toBe('https://my-metrics.example.com/v1/metrics');
  });

  it('derives the US metrics endpoint from a US sdkKey when metricsUrl is not provided', () => {
    const provider = new DynatraceProvider(VALID_KEY_US);
    expect((provider as any)._metricsHook.metricsUrl).toBe('https://metrics.us.fm.dynatrace.com/v1/metrics');
  });

  it('derives the EU metrics endpoint from a EU sdkKey when metricsUrl is not provided', () => {
    const provider = new DynatraceProvider(VALID_KEY_EU);
    expect((provider as any)._metricsHook.metricsUrl).toBe('https://metrics.eu.fm.dynatrace.com/v1/metrics');
  });

  it('defaults pollInterval to -1 (disabled) when not provided', () => {
    new DynatraceProvider(VALID_KEY_US);
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ pollInterval: -1 }));
  });

  it('passes -1 through unchanged (disables polling)', () => {
    new DynatraceProvider(VALID_KEY_US, { pollInterval: -1 });
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ pollInterval: -1 }));
  });

  it('forwards a pollInterval above the minimum unchanged', () => {
    new DynatraceProvider(VALID_KEY_US, { pollInterval: 30_000 });
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ pollInterval: 30_000 }));
  });

  it('accepts exactly 1000ms without clamping', () => {
    new DynatraceProvider(VALID_KEY_US, { pollInterval: 1_000 });
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ pollInterval: 1_000 }));
  });

  it('clamps pollInterval of 999ms up to 1000ms', () => {
    new DynatraceProvider(VALID_KEY_US, { pollInterval: 999 });
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ pollInterval: 1_000 }));
  });

  it('clamps pollInterval of 0 up to 1000ms', () => {
    new DynatraceProvider(VALID_KEY_US, { pollInterval: 0 });
    expect(OFREPWebProvider).toHaveBeenCalledWith(expect.objectContaining({ pollInterval: 1_000 }));
  });

  describe('invalid key formats', () => {
    it('throws for a completely invalid key', () => {
      expect(() => new DynatraceProvider('invalid-key')).toThrow('[DynatraceProvider] Invalid SDK key format');
    });

    it('throws even when a custom apiOrigin is provided', () => {
      expect(() => new DynatraceProvider('invalid-key', { apiOrigin: 'https://custom.example.com' })).toThrow(
        '[DynatraceProvider] Invalid SDK key format',
      );
    });

    it('throws for the old dt_{type}_{region}_{rest} key format', () => {
      expect(() => new DynatraceProvider('dt_server_us_00000000000040008000000000000000')).toThrow(
        '[DynatraceProvider] Invalid SDK key format',
      );
    });

    it('throws when the version number is missing', () => {
      expect(() => new DynatraceProvider('dt.web_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a')).toThrow(
        '[DynatraceProvider] Invalid SDK key format',
      );
    });

    it('throws for a server-type key', () => {
      expect(
        () => new DynatraceProvider('dt01.server_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a'),
      ).toThrow('[DynatraceProvider] Invalid SDK key format');
    });

    it('throws for a mobile-type key', () => {
      expect(
        () => new DynatraceProvider('dt01.mobile_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a'),
      ).toThrow('[DynatraceProvider] Invalid SDK key format');
    });

    it('throws when publicRandom is too short', () => {
      expect(() => new DynatraceProvider('dt01.web_us_ab3x.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a')).toThrow(
        '[DynatraceProvider] Invalid SDK key format',
      );
    });

    it('throws when secret contains non-hex characters', () => {
      expect(() => new DynatraceProvider('dt01.web_us_ab3xy9kp2q.ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ_d4f8a9c12a')).toThrow(
        '[DynatraceProvider] Invalid SDK key format',
      );
    });

    it('throws when sha1 is too short', () => {
      expect(() => new DynatraceProvider('dt01.web_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_abc')).toThrow(
        '[DynatraceProvider] Invalid SDK key format',
      );
    });
  });
});

describe('lifecycle delegation', () => {
  it('initialize delegates to the inner provider', async () => {
    mockInner.initialize.mockResolvedValue(undefined);
    await new DynatraceProvider(VALID_KEY_US).initialize(ctx);
    expect(mockInner.initialize).toHaveBeenCalledWith(ctx);
  });

  it('onContextChange delegates to the inner provider', async () => {
    mockInner.onContextChange.mockResolvedValue(undefined);
    const oldCtx = { targetingKey: 'old' };
    const newCtx = { targetingKey: 'new' };
    await new DynatraceProvider(VALID_KEY_US).onContextChange(oldCtx, newCtx);
    expect(mockInner.onContextChange).toHaveBeenCalledWith(oldCtx, newCtx);
  });

  it('onClose delegates to the inner provider', async () => {
    mockInner.onClose.mockResolvedValue(undefined);
    await new DynatraceProvider(VALID_KEY_US).onClose();
    expect(mockInner.onClose).toHaveBeenCalled();
  });
});

describe('flag resolution', () => {
  it('resolveBooleanEvaluation delegates to the inner provider (without logger)', () => {
    mockInner.resolveBooleanEvaluation.mockReturnValue({ value: true });
    const result = new DynatraceProvider(VALID_KEY_US).resolveBooleanEvaluation('my-flag', false, ctx, logger);
    expect(mockInner.resolveBooleanEvaluation).toHaveBeenCalledWith('my-flag', false, ctx);
    expect(result.value).toBe(true);
  });

  it('resolveStringEvaluation delegates to the inner provider (without logger)', () => {
    mockInner.resolveStringEvaluation.mockReturnValue({ value: 'green' });
    const result = new DynatraceProvider(VALID_KEY_US).resolveStringEvaluation('my-flag', 'red', ctx, logger);
    expect(mockInner.resolveStringEvaluation).toHaveBeenCalledWith('my-flag', 'red', ctx);
    expect(result.value).toBe('green');
  });

  it('resolveNumberEvaluation delegates to the inner provider (without logger)', () => {
    mockInner.resolveNumberEvaluation.mockReturnValue({ value: 99 });
    const result = new DynatraceProvider(VALID_KEY_US).resolveNumberEvaluation('my-flag', 0, ctx, logger);
    expect(mockInner.resolveNumberEvaluation).toHaveBeenCalledWith('my-flag', 0, ctx);
    expect(result.value).toBe(99);
  });

  it('resolveObjectEvaluation delegates to the inner provider (without logger)', () => {
    const payload = { key: 'value' };
    mockInner.resolveObjectEvaluation.mockReturnValue({ value: payload });
    const result = new DynatraceProvider(VALID_KEY_US).resolveObjectEvaluation('my-flag', {}, ctx, logger);
    expect(mockInner.resolveObjectEvaluation).toHaveBeenCalledWith('my-flag', {}, ctx);
    expect(result.value).toEqual(payload);
  });
});

describe('events', () => {
  it('proxies to the inner provider events', () => {
    const emitter = { emit: vi.fn() };
    mockInner.events = emitter;
    expect(new DynatraceProvider(VALID_KEY_US).events).toBe(emitter);
  });
});

describe('config version from OFREP metadata', () => {
  afterEach(() => {
    (mockInner as any)._flagSetMetadataCache = undefined;
  });

  it('reads _flagSetMetadataCache.version from the inner provider after initialize', async () => {
    (mockInner as any)._flagSetMetadataCache = { version: 'ofrep-v7' };
    mockInner.initialize.mockResolvedValue(undefined);

    const provider = new DynatraceProvider(VALID_KEY_US);
    const setConfigVersionSpy = vi.spyOn((provider as any)._metricsHook, 'setConfigVersion');

    await provider.initialize(ctx);

    expect(setConfigVersionSpy).toHaveBeenCalledWith('ofrep-v7');
  });

  it('reads updated _flagSetMetadataCache.version after onContextChange completes', async () => {
    mockInner.onContextChange.mockImplementation(async () => {
      (mockInner as any)._flagSetMetadataCache = { version: 'post-ctx-v3' };
    });

    const provider = new DynatraceProvider(VALID_KEY_US);
    const setConfigVersionSpy = vi.spyOn((provider as any)._metricsHook, 'setConfigVersion');

    await provider.onContextChange({ targetingKey: 'old' }, { targetingKey: 'new' });

    expect(setConfigVersionSpy).toHaveBeenCalledWith('post-ctx-v3');
  });

  it('passes undefined to setConfigVersion when _flagSetMetadataCache is absent', async () => {
    mockInner.initialize.mockResolvedValue(undefined);

    const provider = new DynatraceProvider(VALID_KEY_US);
    const setConfigVersionSpy = vi.spyOn((provider as any)._metricsHook, 'setConfigVersion');

    await provider.initialize(ctx);

    expect(setConfigVersionSpy).toHaveBeenCalledWith(undefined);
  });
});

describe('ConfigurationChanged event handler', () => {
  afterEach(() => {
    mockInner.events = undefined;
    (mockInner as any)._flagSetMetadataCache = undefined;
  });

  function makeEventsEmitter() {
    const handlers = new Map<string, Array<() => void>>();
    return {
      addHandler: vi.fn((event: string, fn: () => void) => {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event)!.push(fn);
      }),
      fire(event: string) {
        handlers.get(event)?.forEach((h) => h());
      },
    };
  }

  it('registers a handler for ConfigurationChanged on construction', () => {
    const emitter = makeEventsEmitter();
    mockInner.events = emitter;

    new DynatraceProvider(VALID_KEY_US);

    expect(emitter.addHandler).toHaveBeenCalledWith(ClientProviderEvents.ConfigurationChanged, expect.any(Function));
  });

  it('calls flush() before setConfigVersion() when ConfigurationChanged fires', () => {
    const emitter = makeEventsEmitter();
    mockInner.events = emitter;
    (mockInner as any)._flagSetMetadataCache = { version: 'v2' };

    const provider = new DynatraceProvider(VALID_KEY_US);
    const metricsHook = (provider as any)._metricsHook;

    const callOrder: string[] = [];
    vi.spyOn(metricsHook, 'flush').mockImplementation(() => callOrder.push('flush'));
    vi.spyOn(metricsHook, 'setConfigVersion').mockImplementation(() => callOrder.push('setConfigVersion'));

    emitter.fire(ClientProviderEvents.ConfigurationChanged);

    expect(callOrder).toEqual(['flush', 'setConfigVersion']);
  });

  it('passes the new OFREP version to setConfigVersion when ConfigurationChanged fires', () => {
    const emitter = makeEventsEmitter();
    mockInner.events = emitter;
    (mockInner as any)._flagSetMetadataCache = { version: 'v2' };

    const provider = new DynatraceProvider(VALID_KEY_US);
    const setConfigVersionSpy = vi.spyOn((provider as any)._metricsHook, 'setConfigVersion');

    emitter.fire(ClientProviderEvents.ConfigurationChanged);

    expect(setConfigVersionSpy).toHaveBeenCalledWith('v2');
  });
});

describe('onContextChange flush ordering', () => {
  afterEach(() => {
    (mockInner as any)._flagSetMetadataCache = undefined;
  });

  it('calls flush() before delegating to the inner provider on context change', async () => {
    const callOrder: string[] = [];
    mockInner.onContextChange.mockImplementation(async () => {
      callOrder.push('onContextChange');
    });

    const provider = new DynatraceProvider(VALID_KEY_US);
    vi.spyOn((provider as any)._metricsHook, 'flush').mockImplementation(() => callOrder.push('flush'));

    await provider.onContextChange({ targetingKey: 'old' }, { targetingKey: 'new' });

    expect(callOrder).toEqual(['flush', 'onContextChange']);
  });

  it('reads updated _flagSetMetadataCache.version after the inner onContextChange resolves', async () => {
    mockInner.onContextChange.mockImplementation(async () => {
      (mockInner as any)._flagSetMetadataCache = { version: 'post-ctx-v5' };
    });

    const provider = new DynatraceProvider(VALID_KEY_US);
    const setConfigVersionSpy = vi.spyOn((provider as any)._metricsHook, 'setConfigVersion');

    await provider.onContextChange({ targetingKey: 'old' }, { targetingKey: 'new' });

    expect(setConfigVersionSpy).toHaveBeenCalledWith('post-ctx-v5');
  });
});
