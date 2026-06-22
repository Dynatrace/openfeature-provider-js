import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import type {
  EvaluationContext,
  JsonValue,
  Logger,
  Provider,
  ProviderEventEmitter,
  AnyProviderEvent,
  ResolutionDetails,
  Hook,
} from '@openfeature/web-sdk';
import { ClientProviderEvents } from '@openfeature/web-sdk';
import { EvaluationMetricsHook } from '../../shared/src/EvaluationMetricsHook.js';
import { buildMetricsUrl, parseSdkKey } from '../../shared/src/sdkKey.js';
import { PACKAGE_VERSION } from './version';

export interface DynatraceProviderOptions {
  /**
   * Override the OFREP API origin (scheme, host, and port). Use this to point the provider at a
   * custom domain. When omitted, the origin is derived from the `geo` segment of the SDK key.
   */
  apiOrigin?: string;
  /**
   * Override the metrics ingest endpoint URL.
   * When omitted the default Dynatrace metrics ingest URL is used.
   */
  metricsUrl?: string;
  /**
   * Poll interval in milliseconds. Defaults to `-1` (disabled).
   * Values less than 1000ms are clamped to 1000ms.
   */
  pollInterval?: number;
  /**
   * How often (in milliseconds) accumulated flag-evaluation metrics are sent to
   * Dynatrace.  Values between 0 and 999 are clamped to 1000ms.
   * Pass a negative number to disable periodic flushing.
   * @default 30_000
   */
  flushIntervalMs?: number;
  /**
   * Maximum number of distinct aggregate-map entries before a capacity flush is
   * triggered.
   * @default 5_000
   */
  maxCapacity?: number;
}

function buildApiOrigin(geo: string): string {
  return `https://ofrep.${geo}.fm.dynatrace.com`;
}

/**
 * Dynatrace OpenFeature provider for web (client-side).
 *
 * Usage:
 * ```ts
 * OpenFeature.setProvider(new DynatraceProvider("dt01.web_us_..."));
 *
 * // with proxy override
 * OpenFeature.setProvider(new DynatraceProvider("dt01.web_us_...", { apiOrigin: "https://my-proxy.example.com" }));
 * ```
 */
export class DynatraceProvider implements Provider {
  public readonly metadata = { name: 'dynatrace' } as const;
  public readonly runsOn = 'client' as const;
  public readonly hooks: Hook[];

  public get events(): ProviderEventEmitter<AnyProviderEvent> | undefined {
    return this._inner.events;
  }

  private readonly _inner: OFREPWebProvider;
  private readonly _metricsHook: EvaluationMetricsHook;

  /**
   * @param sdkKey  Dynatrace web SDK key (`dt01.web_{geo}_...`). Validated immediately.
   * @param options Optional configuration overrides.
   */
  constructor(sdkKey: string, options?: DynatraceProviderOptions) {
    const { apiOrigin, pollInterval = -1, flushIntervalMs, maxCapacity } = options ?? {};
    const { geo, key } = parseSdkKey(sdkKey, 'web');
    const effectiveApiOrigin = apiOrigin ?? buildApiOrigin(geo);
    const effectiveMetricsUrl = options?.metricsUrl ?? buildMetricsUrl(geo);
    const effectivePollInterval = pollInterval !== -1 ? Math.max(pollInterval, 1000) : -1;

    this._inner = new OFREPWebProvider({
      baseUrl: effectiveApiOrigin,
      pollInterval: effectivePollInterval,
      headers: [['Authorization', `Bearer ${key}`]],
    });

    this._metricsHook = new EvaluationMetricsHook({
      authHeader: `Bearer ${key}`,
      metricsUrl: effectiveMetricsUrl,
      flushIntervalMs,
      maxCapacity,
      sdkType: 'web',
      sdkVersion: PACKAGE_VERSION,
      providerName: this.metadata.name,
    });

    this.hooks = [this._metricsHook];

    this._inner.events?.addHandler?.(ClientProviderEvents.ConfigurationChanged, () => {
      this._metricsHook.flush();
      this._metricsHook.setConfigVersion(this._readInnerConfigVersion());
    });
  }

  public async initialize(context?: EvaluationContext): Promise<void> {
    await this._inner.initialize(context);
    this._metricsHook.setConfigVersion(this._readInnerConfigVersion());
  }

  public async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    // Flush before the context change so the drained batch reflects the
    // context (and config version) it was evaluated under.
    this._metricsHook.flush();

    await this._inner.onContextChange(oldContext, newContext);

    this._metricsHook.setConfigVersion(this._readInnerConfigVersion());
  }

  public async onClose(): Promise<void> {
    this._metricsHook.destroy();
    return this._inner.onClose?.() ?? Promise.resolve();
  }

  public resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<boolean> {
    return this._inner.resolveBooleanEvaluation(flagKey, defaultValue, context);
  }

  public resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<string> {
    return this._inner.resolveStringEvaluation(flagKey, defaultValue, context);
  }

  public resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<number> {
    return this._inner.resolveNumberEvaluation(flagKey, defaultValue, context);
  }

  public resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger,
  ): ResolutionDetails<T> {
    return this._inner.resolveObjectEvaluation(flagKey, defaultValue, context);
  }

  /**
   * Read the config version from the OFREP bulk-evaluation response metadata
   * that the inner provider stores after each successful fetch.
   *
   */
  private _readInnerConfigVersion(): string | number | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this._inner as any)._flagSetMetadataCache?.version;
  }
}
