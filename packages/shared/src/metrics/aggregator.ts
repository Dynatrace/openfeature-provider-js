export interface EvaluationMetricKey {
  variant: string;
  reason: string;
  errorCode: string;
  timestampSec: number;
}

function bucketKey(key: EvaluationMetricKey): string {
  return `${key.variant}|${key.reason}|${key.errorCode}|${key.timestampSec}`;
}

export interface MetricsAggregatorOptions {
  /** When true, drops evaluations until a config version is set and when evaluation version mismatches. */
  gateOnVersion?: boolean;
  /** Hard cap on distinct flag keys; new flags are dropped once reached. */
  maxDistinctFlags?: number;
}

export interface DrainedBatch {
  evaluations: Map<string, Map<EvaluationMetricKey, number>>;
  version: string;
  isEmpty(): boolean;
}

export class MetricsAggregator {
  private _evaluations = new Map<string, Map<string, { key: EvaluationMetricKey; count: number }>>();
  private _version = '';
  private _bucketCount = 0;
  private readonly _gateOnVersion: boolean;
  private readonly _maxDistinctFlags: number | undefined;

  constructor(options: MetricsAggregatorOptions = {}) {
    this._gateOnVersion = options.gateOnVersion ?? false;
    this._maxDistinctFlags = options.maxDistinctFlags;
  }

  record(
    flagKey: string,
    variant: string,
    reason: string,
    errorCode: string,
    timestampSec: number,
    evaluationVersion: string | null = null,
  ): void {
    if (this._gateOnVersion) {
      if (!this._version) {
        return;
      }
      if (evaluationVersion != null && evaluationVersion !== this._version) {
        return;
      }
    }

    if (
      this._maxDistinctFlags != null &&
      !this._evaluations.has(flagKey) &&
      this._evaluations.size >= this._maxDistinctFlags
    ) {
      return;
    }

    const metricKey: EvaluationMetricKey = { variant, reason, errorCode, timestampSec };
    const innerKey = bucketKey(metricKey);

    let flagEntry = this._evaluations.get(flagKey);
    if (flagEntry == null) {
      flagEntry = new Map();
      this._evaluations.set(flagKey, flagEntry);
    }

    const existing = flagEntry.get(innerKey);
    if (existing == null) {
      flagEntry.set(innerKey, { key: metricKey, count: 1 });
      this._bucketCount++;
    } else {
      existing.count++;
    }
  }

  setVersion(version: string | number | undefined | null): void {
    if (version != null && String(version).trim() !== '') {
      this._version = String(version);
    }
  }

  getVersion(): string {
    return this._version;
  }

  /** Number of distinct flag keys in the live map. */
  flagCount(): number {
    return this._evaluations.size;
  }

  /** Total distinct metric buckets across all flags (web capacity threshold). */
  bucketCount(): number {
    return this._bucketCount;
  }

  drain(): DrainedBatch {
    const previous = this._evaluations;
    this._evaluations = new Map();
    this._bucketCount = 0;
    const drainedVersion = this._version;

    const evaluations = new Map<string, Map<EvaluationMetricKey, number>>();
    for (const [flagKey, inner] of previous) {
      const buckets = new Map<EvaluationMetricKey, number>();
      for (const { key, count } of inner.values()) {
        buckets.set(key, count);
      }
      evaluations.set(flagKey, buckets);
    }

    return {
      evaluations,
      version: drainedVersion,
      isEmpty: () => evaluations.size === 0,
    };
  }
}
