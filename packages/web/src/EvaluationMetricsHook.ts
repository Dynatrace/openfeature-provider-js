import { StandardResolutionReasons } from '@openfeature/web-sdk';
import type { EvaluationDetails, FlagValue, Hook, HookContext } from '@openfeature/web-sdk';

const TIMESTAMP_FLOOR_SEC = 10;

const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const MIN_FLUSH_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CAPACITY = 5_000;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

const CODE_DEFAULT_VARIANT = '__default__';

export interface EvaluationMetricsOptions {
  /**
   * Full value of the Authorization header to include on flush requests,
   * e.g. `"Bearer dt01.web_us_…"`.
   */
  authHeader: string;
  /**
   * Metrics ingest endpoint URL.
   */
  metricsUrl: string;
  /**
   * How often (in milliseconds) accumulated evaluations are flushed.
   * Values between 0 and 999 are clamped to 1000ms.
   * Pass a negative number to disable periodic flushing.
   * @default 30_000
   */
  flushIntervalMs?: number;
  /**
   * Maximum number of distinct aggregate-map entries before a capacity flush
   * is triggered.
   * @default 5_000
   */
  maxCapacity?: number;

  /** SDK runtime type sent to the ingest endpoint. */
  sdkType: 'web' | 'server' | 'mobile';
  /** Provider package version sent to the ingest endpoint. */
  sdkVersion: string;
  /** Provider name sent to the ingest endpoint. */
  providerName: string;
}

/** A single row in a flush payload. */
export interface FlushRecord {
  flagKey: string;
  variant: string;
  evaluationReason: string;
  errorCode: string;
  /** Wall-clock epoch seconds, always a multiple of {@link TIMESTAMP_FLOOR_SEC}. */
  timestampSec: number;
  count: number;
}

/** The body sent to the metrics endpoint on every flush. */
export interface FlushPayload {
  /** The OFREP config version the SDK was evaluating against during this batch. */
  version: string;
  /** SDK runtime type. */
  sdkType: 'web' | 'server' | 'mobile';
  /** Provider package version. */
  sdkVersion: string;
  /** Provider name. */
  providerName: string;
  /** The config version the SDK was evaluating against during this batch. */
  configVersion: string;
  evaluations: FlushRecord[];
}

export class EvaluationMetricsHook implements Hook {
  private readonly _metricsEndpoint: string;
  private _aggregateMap: Map<string, Map<string, number>> = new Map();
  private _distinctKeyCount = 0;
  private _configVersion = '';

  private _periodicTimer: ReturnType<typeof setInterval> | undefined;
  private _visibilityHandler: (() => void) | undefined;

  private readonly _authHeader: string;
  private readonly _flushIntervalMs: number;
  private readonly _maxCapacity: number;
  private readonly _sdkType: 'web' | 'server' | 'mobile';
  private readonly _sdkVersion: string;
  private readonly _providerName: string;

  constructor(options: EvaluationMetricsOptions) {
    this._metricsEndpoint = options.metricsUrl;
    this._authHeader = options.authHeader;
    const intervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this._flushIntervalMs = intervalMs > 0 ? Math.max(intervalMs, MIN_FLUSH_INTERVAL_MS) : intervalMs;
    this._maxCapacity = options.maxCapacity ?? DEFAULT_MAX_CAPACITY;
    this._sdkType = options.sdkType;
    this._sdkVersion = options.sdkVersion;
    this._providerName = options.providerName;

    this._startPeriodicFlush();
    this._registerVisibilityHandler();
  }

  public finally(_hookCtx: Readonly<HookContext>, evaluationDetails: EvaluationDetails<FlagValue>): void {
    this._record(evaluationDetails);
  }

  /**
   * Update the config version stamped onto the *next* flush batch.
   * Call this after flushing on a config change or after provider initialisation.
   * `undefined` / `null` resets to an empty string.
   */
  public setConfigVersion(version: string | number | undefined | null): void {
    this._configVersion = version != null ? String(version) : '';
  }

  /**
   * Atomically drain the aggregate map and send the payload.
   * The swap is synchronous so evaluations after this call land in a fresh map;
   * none are lost or double-counted.
   *
   * @param useBeacon  When `true` the payload is sent via `navigator.sendBeacon`
   *                   instead of `fetch`. Use this on page-unload paths.
   */
  public flush(useBeacon = false): void {
    const mapToFlush = this._aggregateMap;
    this._aggregateMap = new Map();
    this._distinctKeyCount = 0;

    if (mapToFlush.size === 0) return;

    const payload = this._buildPayload(mapToFlush);

    if (useBeacon) {
      this._sendBeacon(payload);
    } else {
      this._sendWithRetry(payload, 0);
    }
  }

  /**
   * Stop timers, remove the visibility listener, and flush any remaining data.
   * Call this from `Provider.onClose`.
   */
  public destroy(): void {
    this.flush();

    if (this._periodicTimer != null) {
      clearInterval(this._periodicTimer);
      this._periodicTimer = undefined;
    }

    if (this._visibilityHandler != null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = undefined;
    }
  }

  /**
   * For code-default evaluations the metrics variant is a sentinel rather than
   * a flag-defined variant. Errors still use the normalized error reason/code.
   */
  private _record(details: EvaluationDetails<FlagValue>): void {
    const isError = details.errorCode != null;
    const rawReason = (details.reason as string) ?? '';
    const isOpenFeatureDefault = rawReason === StandardResolutionReasons.DEFAULT;

    const variant = isError || isOpenFeatureDefault ? CODE_DEFAULT_VARIANT : (details.variant ?? CODE_DEFAULT_VARIANT);
    const reason = isError ? 'error' : rawReason;
    const errorCode = isError ? String(details.errorCode).toLowerCase() : '';

    // Captured at evaluation time, not flush time.
    const timestampSec = Math.floor(Date.now() / (TIMESTAMP_FLOOR_SEC * 1_000)) * TIMESTAMP_FLOOR_SEC;

    const innerKey = `${variant}|${reason}|${errorCode}|${timestampSec}`;

    let flagEntry = this._aggregateMap.get(details.flagKey);
    if (flagEntry == null) {
      flagEntry = new Map<string, number>();
      this._aggregateMap.set(details.flagKey, flagEntry);
    }

    const existing = flagEntry.get(innerKey);
    if (existing == null) {
      flagEntry.set(innerKey, 1);
      this._distinctKeyCount++;
    } else {
      flagEntry.set(innerKey, existing + 1);
    }

    if (this._distinctKeyCount >= this._maxCapacity) {
      this.flush();
    }
  }

  private _buildPayload(map: Map<string, Map<string, number>>): FlushPayload {
    const evaluations: FlushRecord[] = [];

    for (const [flagKey, innerMap] of map) {
      for (const [innerKey, count] of innerMap) {
        const lastPipe = innerKey.lastIndexOf('|');
        const timestampSec = Number(innerKey.slice(lastPipe + 1));
        const prefix = innerKey.slice(0, lastPipe);

        const secondLastPipe = prefix.lastIndexOf('|');
        const errorCode = prefix.slice(secondLastPipe + 1);
        const reasonPrefix = prefix.slice(0, secondLastPipe);

        const firstPipe = reasonPrefix.indexOf('|');
        const variant = reasonPrefix.slice(0, firstPipe);
        const reason = reasonPrefix.slice(firstPipe + 1);

        evaluations.push({ flagKey, variant, evaluationReason: reason, errorCode, timestampSec, count });
      }
    }

    return {
      version: this._configVersion,
      sdkType: this._sdkType,
      sdkVersion: this._sdkVersion,
      providerName: this._providerName,
      configVersion: this._configVersion,
      evaluations,
    };
  }

  private _sendBeacon(payload: FlushPayload): void {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return;
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(this._metricsEndpoint, blob);
  }

  private _sendWithRetry(payload: FlushPayload, attempt: number): void {
    fetch(this._metricsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this._authHeader },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((res) => {
        if (!res.ok && res.status >= 500 && attempt < MAX_RETRY_ATTEMPTS) {
          this._scheduleRetry(payload, attempt);
        }
      })
      .catch(() => {
        if (attempt < MAX_RETRY_ATTEMPTS) {
          this._scheduleRetry(payload, attempt);
        }
      });
  }

  private _scheduleRetry(payload: FlushPayload, attempt: number): void {
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    setTimeout(() => this._sendWithRetry(payload, attempt + 1), delay);
  }

  private _startPeriodicFlush(): void {
    if (typeof setInterval === 'undefined') return;
    this._periodicTimer = setInterval(() => this.flush(), this._flushIntervalMs);
  }

  private _registerVisibilityHandler(): void {
    if (typeof document === 'undefined') return;
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.flush(/* useBeacon */ true);
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }
}
