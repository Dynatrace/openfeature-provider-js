export type SdkKeyPlatform = 'web' | 'server' | 'mobile';

export interface ParsedSdkKey {
  token: string;
  platform: SdkKeyPlatform;
  geo: string;
  publicRandom: string;
  /** Full trimmed SDK key including the private segment. */
  key: string;
}

/** SDK key format: {token}.{platform}_{geo}_{publicRandom}.{secret}_{sha1} */
const KEY_PATTERN =
  /^(dt[0-9]{2})\.(web|server|mobile)_([a-z]{2,})_([a-zA-Z0-9]{10,})\.([a-fA-F0-9]{32,})_([a-f0-9]{10,})$/;

/**
 * Validates and parses a Dynatrace SDK key.
 *
 * @param sdkKey Full SDK key value.
 * @param expectedPlatform When set, rejects keys whose platform segment does not match.
 */
export function parseSdkKey(sdkKey: string, expectedPlatform?: SdkKeyPlatform): ParsedSdkKey {
  if (sdkKey == null || sdkKey.trim() === '') {
    throw new Error('key must not be null or blank');
  }

  const trimmed = sdkKey.trim();
  const match = KEY_PATTERN.exec(trimmed);
  if (!match) {
    if (expectedPlatform != null) {
      throw new Error(`[DynatraceProvider] Invalid SDK key format: "${trimmed}".`);
    }
    throw new Error(
      `[DynatraceProvider] Invalid SDK key format (public: '${publicKey(trimmed)}'); ` +
        'expected dt{NN}.{platform}_{geo}_{rand}.{secret}_{sha}',
    );
  }

  const platform = match[2] as SdkKeyPlatform;
  if (expectedPlatform != null && platform !== expectedPlatform) {
    throw new Error(`[DynatraceProvider] Invalid SDK key format: "${trimmed}".`);
  }

  return {
    token: match[1],
    platform,
    geo: match[3],
    publicRandom: match[4],
    key: trimmed,
  };
}

/** Public segment of the SDK key (everything before the last dot), safe for logs. */
export function publicKey(sdkKey: string): string {
  const trimmed = sdkKey.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0) {
    return '<redacted>';
  }
  return trimmed.substring(0, lastDot);
}

/** Default Dynatrace metrics ingest URL for a geo region. */
export function buildMetricsUrl(geo: string): string {
  return `https://metrics.${geo}.fm.dynatrace.com/v1/metrics`;
}

/**
 * Builds the CDN config URL for a server or web SDK key.
 *
 * @param configOrigin Optional origin override (scheme + host + port, no path).
 */
export function buildCdnUrl(key: string, platform: string, geo: string, configOrigin?: string): string {
  const base = configOrigin
    ? `${configOrigin.replace(/\/$/, '')}/${platform}/`
    : `https://cdn.${geo}.fm.dynatrace.com/${platform}/`;
  return `${base}${key}.json`;
}
