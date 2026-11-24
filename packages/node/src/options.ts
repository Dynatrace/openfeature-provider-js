import { METRICS_INGEST_PATH, metricsUrlFromOrigin, validateOrigin } from '../../shared/src/origin.js';
import { buildCdnUrl, buildMetricsUrl, parseSdkKey, publicKey, type ParsedSdkKey } from '../../shared/src/sdkKey.js';
import type { Logger } from '@openfeature/server-sdk';
import type { FlagdCore } from '@openfeature/flagd-core';
import type { FetchFn } from './cdnFetcher.js';
import type { ServerMetricsFlusher } from './metrics/ServerMetricsFlusher.js';
import type { EventSourceFactory } from './sseManager.js';

export const DEFAULT_METRICS_FLUSH_INTERVAL_MS = 30_000;
export const DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS = 1_000;
export const DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS = 2_000;

export const ENV_SDK_KEY = 'DT_FM_SDK_KEY';
export const ENV_CONFIG_ORIGIN = 'DT_FM_CONFIG_ORIGIN';
export const ENV_METRICS_ORIGIN = 'DT_FM_METRICS_ORIGIN';
export const ENV_SSE_DISABLED = 'DT_FM_SSE_DISABLED';

/** Reads one environment variable; `undefined` when unset. */
export type EnvLookup = (name: string) => string | undefined;

const processEnv: EnvLookup = (name) => process.env[name];

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
  env?: EnvLookup;
}

export interface DynatraceProviderOptions {
  /**
   * Override the config origin (scheme, host, and port; no path, query, or fragment).
   * If set, carefully consider whether `metricsOrigin` should be set too; an SDK proxy or custom host typically serves both.
   */
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

/**
 * Resolves each option as code value, else `DT_FM_*` env var, else default.
 * Env values get the same validation as code values.
 */
export function resolveProviderOptions(
  sdkKey: string | undefined,
  options: DynatraceProviderOptions = {},
  env: EnvLookup = processEnv,
): ResolvedProviderOptions {
  const parsed = parseServerKey(sdkKey, env);
  const trimmedKey = parsed.key;

  let configOrigin: string | undefined;
  if (options.configOrigin !== undefined) {
    if (options.configOrigin == null || options.configOrigin.trim() === '') {
      throw new Error('configOrigin must not be null or blank');
    }
    configOrigin = validateOrigin(options.configOrigin.trim(), 'configOrigin');
  } else {
    const envConfigOrigin = readEnv(env, ENV_CONFIG_ORIGIN);
    if (envConfigOrigin !== undefined) {
      configOrigin = validateOrigin(envConfigOrigin, ENV_CONFIG_ORIGIN);
    }
  }

  let metricsUrl: string;
  if (options.metricsOrigin !== undefined) {
    metricsUrl = metricsUrlFromOrigin(options.metricsOrigin);
  } else {
    const envMetricsOrigin = readEnv(env, ENV_METRICS_ORIGIN);
    metricsUrl =
      envMetricsOrigin !== undefined
        ? `${validateOrigin(envMetricsOrigin, ENV_METRICS_ORIGIN)}${METRICS_INGEST_PATH}`
        : buildMetricsUrl(parsed.geo);
  }

  const cdnUrl = buildCdnUrl(trimmedKey, parsed.platform, parsed.geo, configOrigin);
  const disableSse =
    options.disableSse !== undefined ? options.disableSse === true : (parseEnvBoolean(env, ENV_SSE_DISABLED) ?? false);

  return {
    sdkKey: trimmedKey,
    cdnUrl,
    configOrigin: new URL(cdnUrl).origin,
    metricsUrl,
    publicKey: publicKey(trimmedKey),
    sseEnabled: !disableSse,
  };
}

function parseServerKey(sdkKey: string | undefined, env: EnvLookup): ParsedSdkKey {
  if (sdkKey?.trim()) {
    return parseSdkKey(sdkKey, 'server');
  }
  const envKey = readEnv(env, ENV_SDK_KEY);
  if (envKey === undefined) {
    throw new Error(`[DynatraceProvider] SDK key is required; pass sdkKey or set ${ENV_SDK_KEY}`);
  }
  try {
    return parseSdkKey(envKey, 'server');
  } catch (err) {
    // parseSdkKey only reports the public segment, so the message is safe to rethrow
    throw new Error(`${err instanceof Error ? err.message : String(err)} (from ${ENV_SDK_KEY})`);
  }
}

/** trimmed env value; unset and blank both read as undefined */
function readEnv(env: EnvLookup, name: string): string | undefined {
  const value = env(name)?.trim();
  return value ? value : undefined;
}

function parseEnvBoolean(env: EnvLookup, name: string): boolean | undefined {
  const value = readEnv(env, name);
  if (value === undefined) {
    return undefined;
  }
  switch (value.toLowerCase()) {
    case 'true':
      return true;
    case 'false':
      return false;
    default:
      throw new Error(`${name} must be "true" or "false"; got: "${value}"`);
  }
}
