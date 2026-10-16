import { FlagdCore } from '@openfeature/flagd-core';
import type { EvaluationContext, JsonValue, Logger, Provider, ResolutionDetails, Hook } from '@openfeature/server-sdk';
import { ErrorCode, OpenFeatureEventEmitter, ProviderEvents } from '@openfeature/server-sdk';
import { resolveLogger } from '../../shared/src/logger.js';
import { MetricsAggregator } from '../../shared/src/metrics/aggregator.js';
import { MetricsHook } from '../../shared/src/metrics/MetricsHook.js';
import { CdnFetcher } from './cdnFetcher.js';
import { isSuccess } from './fetchResult.js';
import { ServerMetricsFlusher } from './metrics/ServerMetricsFlusher.js';
import type { DynatraceProviderOptions, ProviderInternals } from './options.js';
import {
  DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS,
  DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS,
  resolveProviderOptions,
} from './options.js';
import { PollingManager, DEFAULT_POLL_INTERVAL_MS, SSE_CONNECTED_POLL_INTERVAL_MS } from './pollingManager.js';
import { RetryStrategy } from './retry.js';
import { SseManager, defaultEventSourceFactory, type EventSourceFactory } from './sseManager.js';
import { sseUrlFrom } from './sse/cdnConfig.js';
import { SSE_TYPE_REFETCH_CONFIG, type SseMessage } from '../../shared/src/sse/sseMessage.js';
import { PACKAGE_VERSION } from './version.js';

/** STALE -> ERROR grace period (not user-configurable per spec). */
export const GRACE_PERIOD_MS = 60_000;

/**
 * How long an SSE fault has to persist before it counts as a disconnect. The EventSource reports
 * every transient blip, so escalating on the first would flap STALE/READY on routine reconnects.
 */
export const SSE_DISCONNECT_DEBOUNCE_MS = 5_000;

type ProviderState = 'NOT_READY' | 'READY' | 'STALE' | 'ERROR';

/**
 * Dynatrace OpenFeature server provider for Node.js: flagd config from the fm-service CDN,
 * in-process eval via flagd-core, SSE change notifications, and polling with
 * READY -> STALE -> ERROR transitions. Polling relaxes to 10m while SSE is connected and
 * tightens to 10s while it is not (providers.md 2.1).
 */
export class DynatraceProvider implements Provider {
  public readonly metadata = { name: 'dynatrace' } as const;
  public readonly runsOn = 'server' as const;
  public readonly events = new OpenFeatureEventEmitter();
  public readonly hooks: Hook[];

  private readonly _options: ReturnType<typeof resolveProviderOptions>;
  private readonly _logger: Logger;
  private readonly _flagdCore: FlagdCore;
  private readonly _fetcher: CdnFetcher;
  private readonly _metricsAggregator: MetricsAggregator;
  private readonly _metricsFlusher: ServerMetricsFlusher;
  private readonly _gracePeriodMs: number;
  private readonly _pollIntervalMs: number;
  private readonly _pollIntervalSseConnectedMs: number;
  private readonly _sseDisconnectDebounceMs: number;
  private readonly _createEventSource: EventSourceFactory;

  private _state: ProviderState = 'NOT_READY';
  private _shutdown = false;
  private _generation = 0;
  private _closing: Promise<void> | undefined;
  private _graceTimer: ReturnType<typeof setTimeout> | undefined;
  private _pollingManager: PollingManager | undefined;
  private _sseManager: SseManager | undefined;
  private _sseConnected = false;
  private _sseDisconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(sdkKey: string, options?: DynatraceProviderOptions);
  /** @internal Test seam; stripped from the published declarations. */
  constructor(sdkKey: string, options: DynatraceProviderOptions | undefined, internals: ProviderInternals);
  constructor(sdkKey: string, options?: DynatraceProviderOptions, internals?: ProviderInternals) {
    this._options = resolveProviderOptions(sdkKey, options);
    this._logger = resolveLogger(options?.logger, this._options.sdkKey);

    this._flagdCore = internals?.flagdCore ?? new FlagdCore();
    this._fetcher = new CdnFetcher(
      this._options.cdnUrl,
      new RetryStrategy(),
      internals?.fetch,
      undefined,
      this._logger,
    );
    this._metricsAggregator = new MetricsAggregator({
      gateOnVersion: true,
      maxDistinctFlags: DEFAULT_METRICS_HARD_CAP_DISTINCT_FLAGS,
    });
    this._metricsFlusher =
      internals?.metricsFlusher ??
      new ServerMetricsFlusher({
        aggregator: this._metricsAggregator,
        sdkKey: this._options.sdkKey,
        metricsUrl: this._options.metricsUrl,
        softCapDistinctFlags: DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS,
        sdkVersion: PACKAGE_VERSION,
        providerName: this.metadata.name,
        fetch: internals?.metricsFetch ?? internals?.fetch,
        logger: this._logger,
      });
    this.hooks = [
      new MetricsHook(this._metricsAggregator, {
        onRecord: () => this._metricsFlusher.onRecord(),
      }),
    ];
    this._gracePeriodMs = internals?.gracePeriodMs ?? GRACE_PERIOD_MS;
    this._pollIntervalMs = internals?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this._pollIntervalSseConnectedMs = internals?.pollIntervalSseConnectedMs ?? SSE_CONNECTED_POLL_INTERVAL_MS;
    this._sseDisconnectDebounceMs = internals?.sseDisconnectDebounceMs ?? SSE_DISCONNECT_DEBOUNCE_MS;
    this._createEventSource = internals?.eventSourceFactory ?? defaultEventSourceFactory;
  }

  async initialize(_context?: EvaluationContext): Promise<void> {
    // A re-initialize can overtake one still awaiting the CDN; generation ensures only the newest touches shared state.
    const generation = ++this._generation;
    this._shutdown = false;
    this._closing = undefined;
    // Drop a previous lifecycle's stream before anything can connect.
    this._stopSse();
    // A fresh lifecycle re-fetches in full; the previous validators would earn a 304 init cannot accept.
    this._fetcher.reset();

    try {
      if (!(await this._loadInitialConfig(generation))) {
        return;
      }
    } catch (err) {
      // Start polling even though init failed (providers.md 5): the next tick is the only thing that can recover it.
      if (!this._isSuperseded(generation)) {
        this._startPolling();
      }
      throw err;
    }

    this._startPolling();
  }

  /** Runs the initial CDN fetch and loads it; returns false if a newer lifecycle took over mid-fetch. */
  private async _loadInitialConfig(generation: number): Promise<boolean> {
    const result = await this._fetcher.fetch();

    if (!isSuccess(result)) {
      throw new Error(`initial CDN fetch returned HTTP ${result.status}`);
    }

    const body = result.body;
    if (body == null || body.trim() === '') {
      throw new Error('initial CDN response body was empty');
    }

    if (this._isSuperseded(generation)) {
      return false;
    }

    try {
      this._flagdCore.setConfigurations(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`initial CDN config is invalid: ${message}`);
    }

    // Accepted body is the baseline: the first poll is conditional and the stale-node check has a lastModifiedAt.
    this._fetcher.commit();

    this._updateMetricsVersionFromFlagSet();
    this._syncSse(body);

    this._state = 'READY';
    this._logger.info(`initialized; polling ${this._options.cdnUrl} every ${this._pollIntervalMs}ms`);
    return true;
  }

  private _startPolling(): void {
    this._pollingManager?.stop();
    this._pollingManager = new PollingManager(
      {
        fetchFlags: (signal) => this._fetcher.fetch(signal),
        storeFlags: (json) => this._storeFlags(json),
        commitFetch: () => this._fetcher.commit(),
        emitChange: (changedKeys) => this._emitConfigurationChanged(changedKeys),
        emitSuccess: () => this._onFetchSuccess(),
        emitFailure: (reason) => this._onFetchFailure(reason),
        isNewerThanApplied: (lastModifiedMs) => this._fetcher.isNewerThanCommitted(lastModifiedMs),
      },
      this._pollIntervalMs,
      this._logger,
    );
    this._pollingManager.start();
    // The stream can open before this manager exists; adopt the relaxed cadence it asked for.
    if (this._sseConnected) {
      this._pollingManager.setIntervalMs(this._pollIntervalSseConnectedMs);
    }
    this._metricsFlusher.start();
  }

  /** True once onClose() or a newer initialize() has taken over this lifecycle. */
  private _isSuperseded(generation: number): boolean {
    return this._shutdown || generation !== this._generation;
  }

  /**
   * Closes the provider. Concurrent callers await the same shutdown.
   *
   * The SDK can call this more than once on one instance: provider replacement does not
   * await it, and close() fans out over domain-scoped providers in parallel. Returning the
   * in-flight promise keeps every caller waiting for the final metrics delivery.
   */
  onClose(): Promise<void> {
    this._closing ??= this._close();
    return this._closing;
  }

  private async _close(): Promise<void> {
    this._shutdown = true;

    this._logger.info('shutting down');
    // Close the stream first (providers.md 6.1).
    this._stopSse();
    this._pollingManager?.stop();
    this._pollingManager = undefined;
    this._cancelGraceTimer();
    this._cancelSseDisconnectTimer();
    await this._metricsFlusher.shutdown();
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
    const sealedMetrics = this._metricsAggregator.drain();
    this._metricsFlusher.enqueueSealedBatch(sealedMetrics);
    this._metricsFlusher.triggerFlush();
    const changedKeys = this._flagdCore.setConfigurations(json);
    this._updateMetricsVersionFromFlagSet();
    this._syncSse(json);
    return changedKeys;
  }

  private _updateMetricsVersionFromFlagSet(): void {
    const version = this._flagdCore.getFlagSetMetadata().version;
    // The aggregator normalizes strings and numbers; anything else clears the gate rather
    // than attributing new evaluations to the version the previous config carried.
    const usable = typeof version === 'string' || typeof version === 'number';
    this._metricsAggregator.setVersion(usable ? version : undefined);
  }

  // -- SSE --

  /**
   * Points the SSE connection at whatever stream the config in force advertises. Runs on every
   * accepted config because the URL embeds a channel key the server rotates; an unchanged URL is
   * a no-op.
   */
  private _syncSse(configJson: string): void {
    if (!this._options.sseEnabled) {
      return;
    }

    const url = sseUrlFrom(configJson, this._options.configOrigin);

    if (url == null) {
      if (this._sseManager != null) {
        this._logger.info('config no longer advertises an SSE stream; falling back to polling only');
        this._stopSse();
      } else {
        this._logger.info('config advertises no SSE stream; polling only');
      }
      return;
    }

    if (this._sseManager?.url === url) {
      return;
    }

    if (this._sseManager != null) {
      this._logger.info('SSE stream URL rotated; reconnecting');
      this._stopSse();
    }

    const manager = new SseManager(
      url,
      {
        onConnected: () => this._onSseConnected(),
        onDisconnected: () => this._onSseDisconnected(),
        onMessage: (message) => this._onSseMessage(message),
      },
      this._createEventSource,
      this._logger,
    );
    this._sseManager = manager;

    try {
      manager.start();
    } catch (err) {
      // Not fatal: polling still carries changes, just slower.
      manager.stop();
      this._sseManager = undefined;
      this._logger.warn(
        `failed to open the SSE connection; falling back to polling only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private _stopSse(): void {
    this._cancelSseDisconnectTimer();
    this._sseManager?.stop();
    this._sseManager = undefined;
    this._sseConnected = false;
  }

  private _onSseConnected(): void {
    // A pending escalation means the stream blipped: pull the config in case a change landed.
    const hadPendingDisconnect = this._cancelSseDisconnectTimer();
    const wasConnected = this._sseConnected;
    this._sseConnected = true;
    this._pollingManager?.setIntervalMs(this._pollIntervalSseConnectedMs);

    if (!wasConnected) {
      this._logger.info(`SSE connected; poll interval relaxed to ${this._pollIntervalSseConnectedMs}ms`);
    }
    if (!wasConnected || hadPendingDisconnect) {
      this._pollingManager?.requestSseRefetch();
    }
  }

  /** Starts the debounce window; a fault only becomes a disconnect if the stream stays down. */
  private _onSseDisconnected(): void {
    if (!this._sseConnected || this._sseDisconnectTimer != null) {
      return;
    }
    this._logger.debug(`SSE fault; waiting ${this._sseDisconnectDebounceMs}ms before treating it as a disconnect`);
    this._sseDisconnectTimer = setTimeout(() => this._escalateSseDisconnect(), this._sseDisconnectDebounceMs);
  }

  /**
   * Runs once a fault has outlived the debounce window: poll aggressively again and go STALE.
   * Re-anchoring the ticker closes the cadence gap without an out-of-band fetch that would flap
   * STALE straight back to READY.
   */
  private _escalateSseDisconnect(): void {
    this._sseDisconnectTimer = undefined;
    if (!this._sseConnected) {
      return;
    }
    this._sseConnected = false;
    this._logger.warn(`SSE disconnected; poll interval tightened to ${this._pollIntervalMs}ms`);
    this._pollingManager?.setIntervalMs(this._pollIntervalMs);

    if (this._state === 'READY') {
      this._state = 'STALE';
      this.events.emit(ProviderEvents.Stale, { message: 'SSE disconnected' });
      this._startGraceTimer();
    }
  }

  /** Cancels a pending escalation, returning whether one was actually pending. */
  private _cancelSseDisconnectTimer(): boolean {
    if (this._sseDisconnectTimer == null) {
      return false;
    }
    clearTimeout(this._sseDisconnectTimer);
    this._sseDisconnectTimer = undefined;
    return true;
  }

  private _onSseMessage(message: SseMessage): void {
    if (message.type !== SSE_TYPE_REFETCH_CONFIG) {
      this._logger.debug(`ignoring SSE message of type '${message.type}'`);
      return;
    }

    // never dropped up front: second-precision timestamps can tie, and the conditional GET is cheap
    const announcedMs = message.lastModified != null ? message.lastModified * 1_000 : undefined;
    this._pollingManager?.requestSseRefetch(announcedMs);
  }

  private _onFetchSuccess(): void {
    this._cancelGraceTimer();
    // NOT_READY is reachable: a failed init leaves the poller running, so the first good tick makes us usable.
    if (this._state !== 'READY') {
      this._state = 'READY';
      this.events.emit(ProviderEvents.Ready, { message: 'recovered' });
    }
  }

  private _onFetchFailure(reason: string): void {
    // providers.md 4.1: SSE is still delivering changes, and the next poll retries.
    if (this._sseConnected) {
      this._logger.warn(`poll failed, staying READY because SSE is connected: ${reason}`);
      return;
    }
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
    this._logger.error(`grace period of ${this._gracePeriodMs}ms expired without a successful poll; CDN unreachable`);
    this.events.emit(ProviderEvents.Error, { message: 'grace period expired; CDN unreachable' });
  }
}
