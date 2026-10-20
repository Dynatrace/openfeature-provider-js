import { metricsUrlFromOrigin, validateOrigin } from '../../shared/src/origin.js';
import { buildCdnUrl, buildMetricsUrl, parseSdkKey, publicKey } from '../../shared/src/sdkKey.js';
import type { Logger } from '@openfeature/server-sdk';
import type { FlagdCore } from '@openfeature/flagd-core';
import type { FetchFn } from './cdnFetcher.js';
import type { ServerMetricsFlusher } from './metrics/ServerMetricsFlusher.js';
import type { EventSourceFactory } from './sseManager.js';

export const DEFAULT_METRICS_FLUSH_INTERVAL_MS = 30_000;
export const DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS = 1_000;
export const DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS = 2_000;

/**
 * Collaborator overrides for tests.
 *
 * Deliberately NOT part of {@link DynatraceProviderOptions} and not re-exported from the
 * package entry point, so it never reaches the published type surface. The siblings do the
 * same: Python uses keyword-only constructor arguments, Go uses unexported option functions.
 *
 * @internal
 */
export interface ProviderInternals {
  flagdCore?: FlagdCore;
  fetch?: FetchFn;
  metricsFetch?: FetchFn;
  metricsFlusher?: ServerMetricsFlusher;
  gracePeriodMs?: number;
  pollIntervalMs?: number;
  pollIntervalSseConnectedMs?: number;
  eventSourceFactory?: EventSourceFactory;
}

export interface DynatraceProviderOptions {
  /** Override the config origin (scheme, host, and port; no path, query, or fragment). */
  configOrigin?: string;
  /** Override the metrics origin (scheme, host, and port; no path, query, or fragment). */
  metricsOrigin?: string;
  /** opt out of SSE; polling then stays at 10s instead of relaxing to 10m */
  disableSse?: boolean;
  /**
   * Receives provider diagnostics. Defaults to the OpenFeature console logger, which emits
   * `error` and `warn` and drops `info` and `debug`; supply one to capture those levels.
   */
  logger?: Logger;
}

export interface ResolvedProviderOptions {
  sdkKey: string;
  cdnUrl: string;
  /** origin the CDN URL was built from; fallback for an SSE endpoint without one */
  configOrigin: string;
  metricsUrl: string;
  publicKey: string;
  sseEnabled: boolean;
}

export function resolveProviderOptions(
  sdkKey: string,
  options: DynatraceProviderOptions = {},
): ResolvedProviderOptions {
  const parsed = parseSdkKey(sdkKey, 'server');
  const trimmedKey = parsed.key;

  let configOrigin: string | undefined;
  if (options.configOrigin !== undefined) {
    if (options.configOrigin == null || options.configOrigin.trim() === '') {
      throw new Error('configOrigin must not be null or blank');
    }
    configOrigin = validateOrigin(options.configOrigin.trim(), 'configOrigin');
  }

  const metricsUrl =
    options.metricsOrigin !== undefined ? metricsUrlFromOrigin(options.metricsOrigin) : buildMetricsUrl(parsed.geo);

  const cdnUrl = buildCdnUrl(trimmedKey, parsed.platform, parsed.geo, configOrigin);

  return {
    sdkKey: trimmedKey,
    cdnUrl,
    configOrigin: new URL(cdnUrl).origin,
    metricsUrl,
    publicKey: publicKey(trimmedKey),
    sseEnabled: options.disableSse !== true,
  };
}
