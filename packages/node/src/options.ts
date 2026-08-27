import { metricsUrlFromOrigin, validateOrigin } from '../../shared/src/origin.js';
import { buildCdnUrl, buildMetricsUrl, parseSdkKey, publicKey } from '../../shared/src/sdkKey.js';

export const DEFAULT_METRICS_FLUSH_INTERVAL_MS = 30_000;
export const DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS = 1_000;
export const DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS = 2_000;

export interface DynatraceProviderOptions {
  /** Override the config origin (scheme, host, and port; no path, query, or fragment). */
  configOrigin?: string;
  /** Override the metrics origin (scheme, host, and port; no path, query, or fragment). */
  metricsOrigin?: string;
}

export interface ResolvedProviderOptions {
  sdkKey: string;
  cdnUrl: string;
  metricsUrl: string;
  publicKey: string;
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
    metricsUrl,
    publicKey: publicKey(trimmedKey),
  };
}
