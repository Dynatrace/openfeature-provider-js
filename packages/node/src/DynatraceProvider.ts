import { FlagdCore } from '@openfeature/flagd-core';
import type { FetchFn } from './cdnFetcher.js';
import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails, Hook } from '@openfeature/server-sdk';
import { ErrorCode, OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/server-sdk';
import { CdnFetcher } from './cdnFetcher.js';
import { isSuccess } from './fetchResult.js';
import type { DynatraceProviderOptions } from './options.js';
import { resolveProviderOptions } from './options.js';
import { PollingManager, DEFAULT_POLL_INTERVAL_MS } from './pollingManager.js';
import { RetryStrategy } from './retry.js';

/** STALE → ERROR grace period (not user-configurable per spec). */
export const GRACE_PERIOD_MS = 60_000;

type ProviderState = 'NOT_READY' | 'READY' | 'STALE' | 'ERROR';

/**
 * Dynatrace OpenFeature provider for Node.js (server-side).
 *
 * Fetches flagd config from the fm-service CDN, evaluates in-process via flagd-core,
 * and polls on a fixed 10s interval with READY → STALE → ERROR state transitions.
 */
export class DynatraceProvider implements Provider {
  public readonly metadata = { name: 'dynatrace' } as const;
  public readonly runsOn = 'server' as const;
  public readonly events = new OpenFeatureEventEmitter();
  public readonly hooks: Hook[] = [];

  private readonly _options: ReturnType<typeof resolveProviderOptions>;
  private readonly _flagdCore: FlagdCore;
  private readonly _fetcher: CdnFetcher;
  private readonly _gracePeriodMs: number;
  private readonly _pollIntervalMs: number;

  private _state: ProviderState = 'NOT_READY';
  private _shutdown = false;
  private _graceTimer: ReturnType<typeof setTimeout> | undefined;
  private _pollingManager: PollingManager | undefined;

  constructor(sdkKey: string, options?: DynatraceProviderOptions) {
    this._options = resolveProviderOptions(sdkKey, options);
    const testHooks = options?.testHooks;

    this._flagdCore = testHooks?.flagdCore ?? new FlagdCore();
    this._fetcher = new CdnFetcher(this._options.cdnUrl, new RetryStrategy(), testHooks?.fetch);
    this._gracePeriodMs = testHooks?.gracePeriodMs ?? GRACE_PERIOD_MS;
    this._pollIntervalMs = testHooks?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  async initialize(_context?: EvaluationContext): Promise<void> {
    const result = await this._fetcher.fetch();

    if (!isSuccess(result)) {
      throw new Error(`initial CDN fetch returned HTTP ${result.status}`);
    }

    const body = result.body;
    if (body == null || body.trim() === '') {
      throw new Error('initial CDN response body was empty');
    }

    try {
      this._flagdCore.setConfigurations(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`initial CDN config is invalid: ${message}`);
    }

    this._state = 'READY';
    this._shutdown = false;

    this._pollingManager = new PollingManager(
      {
        fetchFlags: (signal) => this._fetcher.fetch(signal),
        storeFlags: (json) => this._storeFlags(json),
        emitChange: (changedKeys) => this._emitConfigurationChanged(changedKeys),
        emitSuccess: () => this._onFetchSuccess(),
        emitFailure: (reason) => this._onFetchFailure(reason),
      },
      this._pollIntervalMs,
    );
    this._pollingManager.start();
  }

  async onClose(): Promise<void> {
    if (this._shutdown) {
      return;
    }
    this._shutdown = true;

    this._pollingManager?.stop();
    this._pollingManager = undefined;
    this._cancelGraceTimer();
    this._state = 'NOT_READY';
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(
      this._evaluate(defaultValue, () =>
        this._flagdCore.resolveBooleanEvaluation(flagKey, defaultValue, context, logger),
      ),
    );
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return Promise.resolve(
      this._evaluate(defaultValue, () =>
        this._flagdCore.resolveStringEvaluation(flagKey, defaultValue, context, logger),
      ),
    );
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return Promise.resolve(
      this._evaluate(defaultValue, () =>
        this._flagdCore.resolveNumberEvaluation(flagKey, defaultValue, context, logger),
      ),
    );
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return Promise.resolve(
      this._evaluate(defaultValue, () =>
        this._flagdCore.resolveObjectEvaluation(flagKey, defaultValue, context, logger),
      ),
    );
  }

  /** @internal */
  get state(): ProviderState {
    return this._state;
  }

  /** @internal Test hook. */
  get cdnUrl(): string {
    return this._options.cdnUrl;
  }

  private _evaluate<T>(defaultValue: T, fn: () => ResolutionDetails<T>): ResolutionDetails<T> {
    if (!this._isEvaluating()) {
      return {
        value: defaultValue,
        reason: 'ERROR',
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: 'provider has not been initialized',
      };
    }
    return fn();
  }

  private _isEvaluating(): boolean {
    return this._state === 'READY' || this._state === 'STALE' || this._state === 'ERROR';
  }

  private _storeFlags(json: string): string[] {
    if (this._shutdown) {
      throw new Error('storeFlags called after provider shutdown');
    }
    return this._flagdCore.setConfigurations(json);
  }

  private _onFetchSuccess(): void {
    this._cancelGraceTimer();
    if (this._state === 'STALE' || this._state === 'ERROR') {
      this._state = 'READY';
      this.events.emit(ProviderEvents.Ready, { message: 'recovered' });
    }
  }

  private _onFetchFailure(reason: string): void {
    if (this._state !== 'READY') {
      return;
    }
    this._state = 'STALE';
    this.events.emit(ProviderEvents.Stale, { message: reason });
    this._startGraceTimer();
  }

  private _emitConfigurationChanged(changedKeys: string[]): void {
    if (changedKeys.length === 0) {
      return;
    }
    this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged: changedKeys });
  }

  private _startGraceTimer(): void {
    this._cancelGraceTimer();
    this._graceTimer = setTimeout(() => this._graceExpired(), this._gracePeriodMs);
  }

  private _cancelGraceTimer(): void {
    if (this._graceTimer != null) {
      clearTimeout(this._graceTimer);
      this._graceTimer = undefined;
    }
  }

  private _graceExpired(): void {
    if (this._state !== 'STALE') {
      return;
    }
    this._state = 'ERROR';
    this.events.emit(ProviderEvents.Error, { message: 'grace period expired; CDN unreachable' });
  }
}
