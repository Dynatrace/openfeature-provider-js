import { describe, it, expect } from 'vitest';
import { buildPayload, type BuildPayloadMetadata } from './payload';
import type { DrainedBucket } from './aggregator';

function bucket(overrides: Partial<DrainedBucket['key']> & { count?: number } = {}): DrainedBucket {
  const { count = 1, ...key } = overrides;
  return {
    key: { variant: 'on', reason: 'STATIC', errorCode: '', timestampSec: 1_700_000_000, ...key },
    count,
  };
}

const META: BuildPayloadMetadata = {
  version: 'v1',
  sdkType: 'server',
  sdkVersion: '1.2.3',
  providerName: 'dynatrace',
};

describe('buildPayload', () => {
  it('flattens multiple flags and multiple buckets per flag', () => {
    const evaluations = new Map<string, DrainedBucket[]>([
      ['flag-a', [bucket({ variant: 'on', count: 3 }), bucket({ variant: 'off', reason: 'DEFAULT', count: 2 })]],
      ['flag-b', [bucket({ variant: 'red' })]],
    ]);

    const payload = buildPayload(evaluations, META);

    expect(payload.evaluations).toHaveLength(3);
    expect(payload.evaluations.map((r) => r.flagKey)).toEqual(['flag-a', 'flag-a', 'flag-b']);
    expect(payload.evaluations.find((r) => r.variant === 'off')?.count).toBe(2);
  });

  it('maps bucket key fields onto the row', () => {
    const evaluations = new Map<string, DrainedBucket[]>([
      ['flag-a', [bucket({ variant: 'on', reason: 'TARGETING_MATCH', timestampSec: 1_700_000_010, count: 5 })]],
    ]);

    const [row] = buildPayload(evaluations, META).evaluations;

    expect(row).toMatchObject({
      flagKey: 'flag-a',
      variant: 'on',
      evaluationReason: 'TARGETING_MATCH',
      timestampSec: 1_700_000_010,
      count: 5,
    });
  });

  it('omits errorCode when empty and includes it when present', () => {
    const evaluations = new Map<string, DrainedBucket[]>([
      ['ok', [bucket({ errorCode: '' })]],
      ['bad', [bucket({ errorCode: 'flag_not_found', reason: 'error' })]],
    ]);

    const rows = buildPayload(evaluations, META).evaluations;

    expect(rows.find((r) => r.flagKey === 'ok')).not.toHaveProperty('errorCode');
    expect(rows.find((r) => r.flagKey === 'bad')?.errorCode).toBe('flag_not_found');
  });

  it('includes configVersion mirroring version when includeConfigVersion is true', () => {
    const payload = buildPayload(new Map(), { ...META, includeConfigVersion: true });
    expect(payload.configVersion).toBe('v1');
  });

  it('omits configVersion when includeConfigVersion is false or absent', () => {
    expect(buildPayload(new Map(), { ...META, includeConfigVersion: false })).not.toHaveProperty('configVersion');
    expect(buildPayload(new Map(), META)).not.toHaveProperty('configVersion');
  });

  it('passes through metadata fields', () => {
    const payload = buildPayload(new Map(), META);
    expect(payload).toMatchObject({
      version: 'v1',
      sdkType: 'server',
      sdkVersion: '1.2.3',
      providerName: 'dynatrace',
    });
  });

  it('returns an empty evaluations array for an empty map', () => {
    expect(buildPayload(new Map(), META).evaluations).toEqual([]);
  });
});
