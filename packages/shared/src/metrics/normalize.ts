import { StandardResolutionReasons } from '@openfeature/core';
import type { EvaluationDetails, FlagValue } from '@openfeature/core';

export const DEFAULT_VARIANT = '__default__';

const TIMESTAMP_FLOOR_SEC = 10;

export interface NormalizedEvaluation {
  flagKey: string;
  variant: string;
  reason: string;
  /** Empty string when no error; server payloads omit the field when empty. */
  errorCode: string;
  timestampSec: number;
  evaluationVersion: string | null;
}

/** Normalizes an OpenFeature evaluation into metrics dimensions. */
export function normalizeEvaluation(
  details: EvaluationDetails<FlagValue>,
  nowMs: number = Date.now(),
): NormalizedEvaluation {
  const isError = details.errorCode != null;
  const rawReason = (details.reason as string) ?? '';
  const isOpenFeatureDefault = rawReason === StandardResolutionReasons.DEFAULT;

  const variant = isError || isOpenFeatureDefault ? DEFAULT_VARIANT : (details.variant ?? DEFAULT_VARIANT);
  const reason = isError ? 'error' : rawReason;
  const errorCode = isError ? String(details.errorCode).toLowerCase() : '';

  const timestampSec = Math.floor(nowMs / (TIMESTAMP_FLOOR_SEC * 1_000)) * TIMESTAMP_FLOOR_SEC;

  const evaluationVersion = readVersion(details);

  return {
    flagKey: details.flagKey,
    variant,
    reason,
    errorCode,
    timestampSec,
    evaluationVersion,
  };
}

function readVersion(details: EvaluationDetails<FlagValue>): string | null {
  const version = details.flagMetadata?.version;
  if (version == null) {
    return null;
  }
  return String(version);
}
