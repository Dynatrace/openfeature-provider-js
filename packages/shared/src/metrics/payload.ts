import type { EvaluationMetricKey } from './aggregator';

export interface FlushRecord {
  flagKey: string;
  variant: string;
  evaluationReason: string;
  errorCode: string;
  timestampSec: number;
  count: number;
}

export interface FlushPayload {
  version: string;
  sdkType: 'web' | 'server' | 'mobile';
  sdkVersion: string;
  providerName: string;
  /** Web payloads duplicate version under this field for backward compatibility. */
  configVersion?: string;
  evaluations: FlushRecord[];
}

export interface BuildPayloadMetadata {
  version: string;
  sdkType: 'web' | 'server' | 'mobile';
  sdkVersion: string;
  providerName: string;
  /** When true, includes configVersion mirroring version (web wire format). */
  includeConfigVersion?: boolean;
}

export function buildPayload(
  evaluations: Map<string, Map<EvaluationMetricKey, number>>,
  metadata: BuildPayloadMetadata,
): FlushPayload {
  const rows: FlushRecord[] = [];

  for (const [flagKey, buckets] of evaluations) {
    for (const [key, count] of buckets) {
      rows.push({
        flagKey,
        variant: key.variant,
        evaluationReason: key.reason,
        errorCode: key.errorCode,
        timestampSec: key.timestampSec,
        count,
      });
    }
  }

  const payload: FlushPayload = {
    version: metadata.version,
    sdkType: metadata.sdkType,
    sdkVersion: metadata.sdkVersion,
    providerName: metadata.providerName,
    evaluations: rows,
  };

  if (metadata.includeConfigVersion) {
    payload.configVersion = metadata.version;
  }

  return payload;
}
