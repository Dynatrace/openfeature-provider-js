import type { BaseHook, EvaluationDetails, FlagValue, HookContext } from '@openfeature/core';
import type { MetricsAggregator } from './aggregator';
import { normalizeEvaluation } from './normalize';

export class MetricsHook implements BaseHook {
  private readonly _aggregator: MetricsAggregator;
  private readonly _onRecord: () => void;
  private readonly _now: () => number;

  constructor(aggregator: MetricsAggregator, options: { onRecord?: () => void; now?: () => number } = {}) {
    this._aggregator = aggregator;
    this._onRecord = options.onRecord ?? (() => {});
    this._now = options.now ?? (() => Date.now());
  }

  finally(_hookCtx: Readonly<HookContext>, evaluationDetails: EvaluationDetails<FlagValue>): void {
    const normalized = normalizeEvaluation(evaluationDetails, this._now());
    if (!normalized.flagKey) {
      return;
    }

    this._aggregator.record(
      normalized.flagKey,
      normalized.variant,
      normalized.reason,
      normalized.errorCode,
      normalized.timestampSec,
      normalized.evaluationVersion,
    );

    try {
      this._onRecord();
    } catch {
      // Never block the evaluation path on flush bookkeeping.
    }
  }
}
