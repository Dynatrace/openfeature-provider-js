import { describe, it, expect } from 'vitest';
import { MetricsAggregator } from './aggregator';

describe('MetricsAggregator', () => {
  it('records and drains evaluations', () => {
    const agg = new MetricsAggregator();
    agg.setVersion('v1');
    agg.record('flag-a', 'on', 'TARGETING_MATCH', '', 1_700_000_000);
    const batch = agg.drain();
    expect(batch.version).toBe('v1');
    expect(batch.isEmpty()).toBe(false);
    expect(batch.evaluations.get('flag-a')?.size).toBe(1);
  });

  it('gates on version when enabled', () => {
    const agg = new MetricsAggregator({ gateOnVersion: true });
    agg.record('flag-a', 'on', 'TARGETING_MATCH', '', 1_700_000_000);
    expect(agg.flagCount()).toBe(0);
    agg.setVersion('v1');
    agg.record('flag-a', 'on', 'TARGETING_MATCH', '', 1_700_000_000, 'v1');
    expect(agg.flagCount()).toBe(1);
  });

  it('enforces maxDistinctFlags hard cap', () => {
    const agg = new MetricsAggregator({ gateOnVersion: false, maxDistinctFlags: 1 });
    agg.record('flag-a', 'on', 'STATIC', '', 1_700_000_000);
    agg.record('flag-b', 'off', 'STATIC', '', 1_700_000_000);
    expect(agg.flagCount()).toBe(1);
  });
});
