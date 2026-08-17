import { buildCdnUrl, buildMetricsUrl, parseSdkKey, publicKey } from '../../shared/src/sdkKey.js';

export const DEFAULT_METRICS_FLUSH_INTERVAL_MS = 30_000;
export const DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS = 1_000;
export const DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS = 2_000;

export interface DynatraceProviderOptions {
  /** Override the config origin (scheme, host, and port — no path, query, or fragment). */
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

  if (options.configOrigin !== undefined) {
    if (options.configOrigin == null || options.configOrigin.trim() === '') {
      throw new Error('configOrigin must not be null or blank');
    }
  }
  if (options.metricsUrl !== undefined) {
    if (options.metricsUrl == null || options.metricsUrl.trim() === '') {
      throw new Error('metricsUrl must not be null or blank');
    }
  }

  const trimmedOrigin = options.configOrigin?.trim();
  const configOrigin = trimmedOrigin != null ? normaliseConfigOrigin(trimmedOrigin) : undefined;

  const cdnUrl = buildCdnUrl(trimmedKey, parsed.platform, parsed.geo, configOrigin);
  const metricsUrl = options.metricsUrl?.trim() ?? buildMetricsUrl(parsed.geo);

  return {
    sdkKey: trimmedKey,
    cdnUrl,
    metricsUrl,
    publicKey: publicKey(trimmedKey),
  };
}

/**
 * Validates that `origin` is a bare origin and returns it in canonical form.
 *
 * Returning `url.origin` rather than the caller's string drops any redundant
 * trailing slash and normalises the scheme and host case, while keeping the
 * brackets around an IPv6 literal intact.
 */
function normaliseConfigOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(`configOrigin is not a valid URI: ${origin}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`configOrigin must use http or https; got: "${origin}"`);
  }
  if (url.pathname && url.pathname !== '/') {
    throw new Error(`configOrigin must not include a path; got: "${origin}"`);
  }
  if (url.search) {
    throw new Error(`configOrigin must not include a query string; got: "${origin}"`);
  }
  if (url.hash) {
    throw new Error(`configOrigin must not include a fragment; got: "${origin}"`);
  }
  return url.origin;
}
