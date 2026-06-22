import { buildCdnUrl, buildMetricsUrl, parseSdkKey, publicKey } from '../../shared/src/sdkKey.js';

export const DEFAULT_METRICS_FLUSH_INTERVAL_MS = 30_000;
export const DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS = 1_000;
export const DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS = 2_000;

export interface DynatraceProviderOptions {
  /** Override the config origin (scheme, host, and port — no path). */
  configOrigin?: string;
  /** Override the metrics ingest endpoint URL. */
  metricsUrl?: string;
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

  if (options.configOrigin != null && options.configOrigin.trim() === '') {
    throw new Error('configOrigin must not be null or blank');
  }
  if (options.metricsUrl != null && options.metricsUrl.trim() === '') {
    throw new Error('metricsUrl must not be null or blank');
  }

  const configOrigin = options.configOrigin?.trim();
  if (configOrigin != null) {
    validateConfigOrigin(configOrigin);
  }

  const cdnUrl = buildCdnUrl(trimmedKey, parsed.platform, parsed.geo, configOrigin);
  const metricsUrl = options.metricsUrl?.trim() ?? buildMetricsUrl(parsed.geo);

  return {
    sdkKey: trimmedKey,
    cdnUrl,
    metricsUrl,
    publicKey: publicKey(trimmedKey),
  };
}

function validateConfigOrigin(origin: string): void {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`configOrigin is not a valid URI: ${origin}`);
  }
  if (url.pathname && url.pathname !== '/') {
    throw new Error(`configOrigin must not include a path; got: "${origin}"`);
  }
}
