import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails, Hook } from '@openfeature/server-sdk';
import { ErrorCode } from '@openfeature/core';
import { OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/server-sdk';
import type { DynatraceProviderOptions } from './options';
import { resolveProviderOptions } from './options';

/**
 * Dynatrace OpenFeature provider for Node.js (server-side).
 *
 * Stub implementation: lifecycle and evaluation methods are wired but CDN polling
 * and flagd-core integration land in subsequent PRs.
 */
export class DynatraceProvider implements Provider {
  public readonly metadata = { name: 'dynatrace' } as const;
  public readonly runsOn = 'server' as const;
  public readonly events = new OpenFeatureEventEmitter();
  public readonly hooks: Hook[] = [];

  private readonly _options: ReturnType<typeof resolveProviderOptions>;
  private _initialized = false;

  constructor(sdkKey: string, options?: DynatraceProviderOptions) {
    this._options = resolveProviderOptions(sdkKey, options);
  }

  async initialize(_context?: EvaluationContext): Promise<void> {
    this._initialized = true;
    this.events.emit(ProviderEvents.Ready);
  }

  async onClose(): Promise<void> {
    this._initialized = false;
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(this._notReady(flagKey, defaultValue));
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return Promise.resolve(this._notReady(flagKey, defaultValue));
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return Promise.resolve(this._notReady(flagKey, defaultValue));
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
    _logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return Promise.resolve(this._notReady(flagKey, defaultValue));
  }

  /** @internal Test hook. */
  get initialized(): boolean {
    return this._initialized;
  }

  /** @internal Test hook. */
  get cdnUrl(): string {
    return this._options.cdnUrl;
  }

  private _notReady<T>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    if (!this._initialized) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: 'provider has not been initialized',
      };
    }
    return {
      value: defaultValue,
      reason: 'ERROR',
      errorCode: ErrorCode.FLAG_NOT_FOUND,
      errorMessage: `flag '${flagKey}' not found`,
    };
  }
}
