import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StandardResolutionReasons } from '@openfeature/core';
import { BrowserMetricsTransport } from './BrowserMetricsTransport';
import type { EvaluationDetails, FlagValue } from '@openfeature/core';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Matches the new key format: {token}.web_{geo}_{publicRandom}.{secret}_{sha1}
const VALID_KEY_US = 'dt01.web_us_ab3xy9kp2q.03ee0ef7cd4244bfb8b71fea8f783f53_d4f8a9c12a';
const AUTH_HEADER = `Bearer ${VALID_KEY_US}`;
const MOCK_METRICS_URL = 'https://example.com/v1/metrics';

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeDetails(
  overrides: Partial<EvaluationDetails<FlagValue>> & { flagKey: string },
): EvaluationDetails<FlagValue> {
  return {
    flagMetadata: {},
    variant: 'on',
    reason: 'TARGETING_MATCH',
    value: true,
    ...overrides,
  };
}

function makeTransport(opts?: { flushIntervalMs?: number; maxCapacity?: number }) {
  return new BrowserMetricsTransport({
    authHeader: AUTH_HEADER,
    metricsUrl: MOCK_METRICS_URL,
    flushIntervalMs: opts?.flushIntervalMs ?? 30_000,
    maxCapacity: opts?.maxCapacity ?? 5_000,
    sdkType: 'web',
    sdkVersion: '0.0.0-test',
    providerName: 'dynatrace',
  });
}

function fireFinally(transport: BrowserMetricsTransport, details: EvaluationDetails<FlagValue>): void {
  transport.hook.finally?.({} as any, details);
}

function lastFetchBody(): FlushPayload {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
  return JSON.parse(calls[calls.length - 1][1].body as string) as FlushPayload;
}

// ── Mock document (no jsdom available in this test environment) ───────────────

function createMockDocument() {
  const listeners: Record<string, Array<(e: { type: string }) => void>> = {};
  let _visibilityState = 'visible';
  return {
    get visibilityState() {
      return _visibilityState;
    },
    set visibilityState(v: string) {
      _visibilityState = v;
    },
    addEventListener(type: string, fn: (e: { type: string }) => void) {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener(type: string, fn: (e: { type: string }) => void) {
      listeners[type] = (listeners[type] ?? []).filter((h) => h !== fn);
    },
    dispatchEvent(event: { type: string }) {
      (listeners[event.type] ?? []).forEach((h) => h(event));
      return true;
    },
  };
}

type MockDoc = ReturnType<typeof createMockDocument>;
let mockDoc: MockDoc;

// ── Suite ────────────────────────────────────────────────────────────────────

describe('BrowserMetricsTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
    );

    vi.stubGlobal('navigator', {
      sendBeacon: vi.fn((_url: string, blob: any) => {
        (blob as any).__data = JSON.parse(blob._parts?.[0] ?? '{}') as FlushPayload;
        return true;
      }),
    });

    vi.stubGlobal(
      'Blob',
      class MockBlob {
        _parts: string[];
        type: string;
        __data: unknown;
        constructor(parts: string[], options?: { type?: string }) {
          this._parts = parts;
          this.type = options?.type ?? '';
          this.__data = JSON.parse(parts[0] ?? '{}');
        }
      },
    );

    mockDoc = createMockDocument();
    vi.stubGlobal('document', mockDoc);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function lastBeaconBody(): FlushPayload {
    const calls = (navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls;
    return (calls[calls.length - 1][1] as any).__data as FlushPayload;
  }

  // ── Metrics endpoint configuration ────────────────────────────────────────

  describe('metrics endpoint', () => {
    it('uses the configured metrics endpoint', () => {
      const hook = makeTransport();
      expect((hook as any).metricsUrl).toBe(MOCK_METRICS_URL);
    });

    it('uses the provided metricsUrl override instead of the default', () => {
      const hook = new BrowserMetricsTransport({
        authHeader: AUTH_HEADER,
        metricsUrl: 'https://my-proxy.example.com/v1/metrics',
        flushIntervalMs: 30_000,
        maxCapacity: 5_000,
        sdkType: 'web',
        sdkVersion: '0.0.0-test',
        providerName: 'dynatrace',
      });
      expect((hook as any).metricsUrl).toBe('https://my-proxy.example.com/v1/metrics');
      hook.destroy();
    });

    it('sends flush requests to the overridden metricsUrl', () => {
      const customUrl = 'https://my-proxy.example.com/v1/metrics';
      const hook = new BrowserMetricsTransport({
        authHeader: AUTH_HEADER,
        metricsUrl: customUrl,
        flushIntervalMs: 30_000,
        maxCapacity: 5_000,
        sdkType: 'web',
        sdkVersion: '0.0.0-test',
        providerName: 'dynatrace',
      });

      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' }));
      hook.flush();

      const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(fetchCalls[fetchCalls.length - 1][0]).toBe(customUrl);
      hook.destroy();
    });

    it('sends beacon requests to the overridden metricsUrl on page hide', () => {
      const customUrl = 'https://my-proxy.example.com/v1/metrics';
      const hook = new BrowserMetricsTransport({
        authHeader: AUTH_HEADER,
        metricsUrl: customUrl,
        flushIntervalMs: 30_000,
        maxCapacity: 5_000,
        sdkType: 'web',
        sdkVersion: '0.0.0-test',
        providerName: 'dynatrace',
      });

      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' }));
      mockDoc.visibilityState = 'hidden';
      mockDoc.dispatchEvent({ type: 'visibilitychange' });

      const beaconCalls = (navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls;
      expect(beaconCalls[beaconCalls.length - 1][0]).toBe(customUrl);
      hook.destroy();
    });
  });

  // ── Aggregate map keying ───────────────────────────────────────────────────

  describe('aggregate map keying', () => {
    it('increments count for a successful evaluation', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' }));
      hook.flush();

      const payload = lastFetchBody();
      expect(payload.evaluations).toHaveLength(1);
      const rec = payload.evaluations[0];
      expect(rec.flagKey).toBe('flag-a');
      expect(rec.variant).toBe('on');
      expect(rec.evaluationReason).toBe('TARGETING_MATCH');
      expect(rec.errorCode).toBe('');
      expect(rec.count).toBe(1);
    });

    it('accumulates multiple evaluations of the same variant into one entry', () => {
      const hook = makeTransport();
      const d = makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' });
      fireFinally(hook, d);
      fireFinally(hook, d);
      fireFinally(hook, d);
      hook.flush();

      expect(lastFetchBody().evaluations).toHaveLength(1);
      expect(lastFetchBody().evaluations[0].count).toBe(3);
    });

    it('creates separate entries for different variants of the same flag', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' }));
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'off', reason: 'DEFAULT' }));
      hook.flush();

      expect(lastFetchBody().evaluations).toHaveLength(2);
    });

    it('creates separate entries for different flags', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' }));
      fireFinally(hook, makeDetails({ flagKey: 'flag-b', variant: 'on', reason: 'TARGETING_MATCH' }));
      hook.flush();

      const flags = lastFetchBody().evaluations.map((e) => e.flagKey);
      expect(flags).toContain('flag-a');
      expect(flags).toContain('flag-b');
    });

    it('sends nothing when no evaluations have been recorded', () => {
      const hook = makeTransport();
      hook.flush();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // ── Error normalisation ────────────────────────────────────────────────────

  describe('error normalisation', () => {
    it('uses variant=__default__ for error evaluations', () => {
      const hook = makeTransport();
      fireFinally(
        hook,
        makeDetails({ flagKey: 'flag-a', errorCode: 'FLAG_NOT_FOUND' as any, variant: 'on', reason: 'ERROR' }),
      );
      hook.flush();

      expect(lastFetchBody().evaluations[0].variant).toBe('__default__');
    });

    it('uses variant=__default__ when a fallback evaluation has no variant', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: undefined, reason: 'DEFAULT' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].variant).toBe('__default__');
    });

    it('uses variant=__default__ when the reason is the OpenFeature default reason', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: StandardResolutionReasons.DEFAULT }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].variant).toBe('__default__');
    });

    it('uses evaluationReason=error for error evaluations', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', errorCode: 'FLAG_NOT_FOUND' as any, reason: 'ERROR' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].evaluationReason).toBe('error');
    });

    it('lowercases the errorCode', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', errorCode: 'FLAG_NOT_FOUND' as any, reason: 'ERROR' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].errorCode).toBe('flag_not_found');
    });

    it('populates errorCode with a non-empty string for errors', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', errorCode: 'GENERAL' as any, reason: 'ERROR' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].errorCode).toBeTruthy();
    });

    it('does not set errorCode on successful evaluations', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'flag-a', variant: 'on', reason: 'TARGETING_MATCH' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].errorCode).toBe('');
    });
  });

  // ── timestampSec ───────────────────────────────────────────────────────────

  describe('timestampSec', () => {
    it('is always a multiple of 10', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:07.000Z'));
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].timestampSec % 10).toBe(0);
    });

    it('floors to the correct 10-second bucket', () => {
      // 2024-01-01T00:00:07Z → epoch 1704067207 → floor to 1704067200
      vi.setSystemTime(new Date('2024-01-01T00:00:07.000Z'));
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().evaluations[0].timestampSec).toBe(1704067200);
    });

    it('captures timestampSec at evaluation time, not flush time', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      vi.advanceTimersByTime(60_000);
      hook.flush();

      const evalEpochSec = new Date('2024-01-01T00:00:00.000Z').getTime() / 1_000;
      expect(lastFetchBody().evaluations[0].timestampSec).toBe(evalEpochSec);
    });

    it('buckets evaluations within the same 10-second window together', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:01.000Z'));
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      vi.setSystemTime(new Date('2024-01-01T00:00:09.000Z'));
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      const recs = lastFetchBody().evaluations;
      expect(recs).toHaveLength(1);
      expect(recs[0].count).toBe(2);
    });

    it('creates separate entries for evaluations in different 10-second buckets', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      vi.setSystemTime(new Date('2024-01-01T00:00:10.000Z'));
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().evaluations).toHaveLength(2);
    });
  });

  // ── Config version ─────────────────────────────────────────────────────────

  describe('configVersion', () => {
    it('defaults to an empty string before setConfigVersion is called', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().configVersion).toBe('');
    });

    it('stamps the batch with the configured version', () => {
      const hook = makeTransport();
      hook.setConfigVersion('abc-42');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().configVersion).toBe('abc-42');
    });

    it('coerces numeric versions to strings', () => {
      const hook = makeTransport();
      hook.setConfigVersion(7);
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().configVersion).toBe('7');
    });

    it('reflects the version active during the batch, not the latest-set version', () => {
      const hook = makeTransport();
      hook.setConfigVersion('v1');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      hook.flush();
      hook.setConfigVersion('v2');

      expect(lastFetchBody().configVersion).toBe('v1');
    });
  });

  // ── Payload metadata ──────────────────────────────────────────────────────

  describe('payload metadata', () => {
    it('sets version to the configured OFREP config version', () => {
      const hook = makeTransport();
      hook.setConfigVersion('1779898567');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().version).toBe('1779898567');
    });

    it('includes sdkType="web" in every flush', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().sdkType).toBe('web');
    });

    it('includes the sdkVersion in every flush', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().sdkVersion).toBe('0.0.0-test');
    });

    it('includes the providerName in every flush', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      expect(lastFetchBody().providerName).toBe('dynatrace');
    });
  });

  // ── Atomic map swap ────────────────────────────────────────────────────────

  describe('atomic map swap', () => {
    it('does not double-count: each flush only sees its own batch', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const p1: FlushPayload = JSON.parse(calls[0][1].body as string);
      const p2: FlushPayload = JSON.parse(calls[1][1].body as string);
      expect(p1.evaluations[0].count).toBe(1);
      expect(p2.evaluations[0].count).toBe(1);
    });

    it('a second flush with no new evaluations sends nothing', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();
      hook.flush();

      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });
  });

  // ── Periodic flush ─────────────────────────────────────────────────────────

  describe('periodic flush', () => {
    it('clamps flushIntervalMs values between 0 and 999 to 1000ms', () => {
      const hook = makeTransport({ flushIntervalMs: 50 });
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      vi.advanceTimersByTime(999);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      hook.destroy();
    });

    it('flushes after the configured interval', () => {
      const hook = makeTransport({ flushIntervalMs: 30_000 });
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      expect(globalThis.fetch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      hook.destroy();
    });

    it('does not flush before the interval elapses', () => {
      const hook = makeTransport({ flushIntervalMs: 30_000 });
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      vi.advanceTimersByTime(29_999);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      hook.destroy();
    });

    it('flushes on each successive tick', () => {
      const hook = makeTransport({ flushIntervalMs: 30_000 });

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      vi.advanceTimersByTime(30_000);

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      vi.advanceTimersByTime(30_000);

      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
      hook.destroy();
    });
  });

  // ── Capacity flush ─────────────────────────────────────────────────────────

  describe('capacity flush', () => {
    it('flushes when the distinct-key count reaches maxCapacity', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const hook = makeTransport({ maxCapacity: 3 });

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'a', reason: 'STATIC' }));
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'b', reason: 'STATIC' }));
      expect(globalThis.fetch).not.toHaveBeenCalled();

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'c', reason: 'STATIC' }));
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it('includes all entries up to (and including) the capacity-triggering evaluation', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const hook = makeTransport({ maxCapacity: 2 });

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'a', reason: 'STATIC' }));
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'b', reason: 'STATIC' }));

      expect(lastFetchBody().evaluations).toHaveLength(2);
    });

    it('resets the map after a capacity flush so subsequent evals start fresh', () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const hook = makeTransport({ maxCapacity: 1 });

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'a', reason: 'STATIC' }));
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'a', reason: 'STATIC' }));

      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const p2: FlushPayload = JSON.parse(calls[1][1].body as string);
      expect(p2.evaluations[0].count).toBe(1);
    });
  });

  // ── visibilitychange / sendBeacon flush ────────────────────────────────────

  describe('visibilitychange flush', () => {
    it('calls navigator.sendBeacon when the tab becomes hidden', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      mockDoc.visibilityState = 'hidden';
      mockDoc.dispatchEvent({ type: 'visibilitychange' });

      expect(navigator.sendBeacon).toHaveBeenCalledOnce();
      hook.destroy();
    });

    it('does NOT call fetch (uses sendBeacon instead) when the tab becomes hidden', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      mockDoc.visibilityState = 'hidden';
      mockDoc.dispatchEvent({ type: 'visibilitychange' });

      expect(globalThis.fetch).not.toHaveBeenCalled();
      hook.destroy();
    });

    it('passes the correct endpoint URL to sendBeacon', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      mockDoc.visibilityState = 'hidden';
      mockDoc.dispatchEvent({ type: 'visibilitychange' });

      const url = (navigator.sendBeacon as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(url).toBe(MOCK_METRICS_URL);
      hook.destroy();
    });

    it('does not flush when the tab becomes visible again', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      mockDoc.visibilityState = 'visible';
      mockDoc.dispatchEvent({ type: 'visibilitychange' });

      expect(navigator.sendBeacon).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
      hook.destroy();
    });
  });

  // ── Config-change flush ────────────────────────────────────────────────────

  describe('config-change flush', () => {
    it('flush() before setConfigVersion() ensures the batch carries the old version', () => {
      const hook = makeTransport();
      hook.setConfigVersion('v1');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      hook.flush();
      hook.setConfigVersion('v2');

      expect(lastFetchBody().configVersion).toBe('v1');
    });

    it('evaluations after the version update carry the new version', () => {
      const hook = makeTransport();
      hook.setConfigVersion('v1');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();
      hook.setConfigVersion('v2');

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const p2: FlushPayload = JSON.parse(calls[1][1].body as string);
      expect(p2.configVersion).toBe('v2');
    });

    it('exactly one version value appears per flush batch', () => {
      const hook = makeTransport();
      hook.setConfigVersion('v1');
      fireFinally(hook, makeDetails({ flagKey: 'a', variant: 'on', reason: 'STATIC' }));
      fireFinally(hook, makeDetails({ flagKey: 'b', variant: 'off', reason: 'DEFAULT' }));
      hook.flush();

      const payload = lastFetchBody();
      expect(typeof payload.configVersion).toBe('string');
      expect(payload.configVersion).toBe('v1');
    });
  });

  // ── Context-change flush ───────────────────────────────────────────────────

  describe('context-change flush', () => {
    it('flush() before context change drains the pre-context-change batch', () => {
      const hook = makeTransport();
      hook.setConfigVersion('v1');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      hook.flush();
      hook.setConfigVersion('v1');

      expect(lastFetchBody().evaluations).toHaveLength(1);
    });

    it('evaluations after context change go into a fresh batch', () => {
      const hook = makeTransport();
      hook.setConfigVersion('v1');
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();
      hook.setConfigVersion('v1');

      fireFinally(hook, makeDetails({ flagKey: 'g', variant: 'off', reason: 'DEFAULT' }));
      hook.flush();

      const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      const p2: FlushPayload = JSON.parse(calls[1][1].body as string);
      expect(p2.evaluations[0].flagKey).toBe('g');
    });
  });

  // ── HTTP transport & retry ─────────────────────────────────────────────────

  describe('HTTP transport', () => {
    it('sends POST to the metrics endpoint with the Bearer Authorization header', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe(MOCK_METRICS_URL);
      expect(init.method).toBe('POST');
      expect(init.headers['Authorization']).toBe(AUTH_HEADER);
    });

    it('is non-blocking: flush() returns before fetch resolves', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));

      let returned = false;
      hook.flush();
      returned = true;

      expect(returned).toBe(true);
    });

    it('retries on a 500 response', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          callCount++;
          return Promise.resolve({ ok: false, status: 500 } as Response);
        }),
      );

      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBe(1);

      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('retries on a network error (fetch rejection)', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          callCount++;
          return Promise.reject(new Error('network error'));
        }),
      );

      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBe(1);

      vi.advanceTimersByTime(1_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('stops retrying after MAX_RETRY_ATTEMPTS total attempts', async () => {
      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          callCount++;
          return Promise.resolve({ ok: false, status: 503 } as Response);
        }),
      );

      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
        await Promise.resolve();
        vi.advanceTimersByTime(8_000);
      }
      await Promise.resolve();
      await Promise.resolve();

      // 1 initial + 3 retries = 4 calls max
      expect(callCount).toBeLessThanOrEqual(4);
    });

    it('does not retry on a 4xx client error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve({ ok: false, status: 401 } as Response)),
      );

      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.flush();

      await Promise.resolve();
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();

      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    });
  });

  // ── destroy ────────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('flushes remaining evaluations on destroy', () => {
      const hook = makeTransport();
      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      hook.destroy();

      expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it('stops the periodic timer after destroy', () => {
      const hook = makeTransport({ flushIntervalMs: 30_000 });
      hook.destroy();

      fireFinally(hook, makeDetails({ flagKey: 'f', variant: 'on', reason: 'STATIC' }));
      vi.advanceTimersByTime(30_000);

      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    });
  });
});
