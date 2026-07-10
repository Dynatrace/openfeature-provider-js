import { MetricsAggregator } from '../../../shared/src/metrics/aggregator.js';
import { MetricsHook } from '../../../shared/src/metrics/MetricsHook.js';
import { buildPayload, type FlushPayload } from '../../../shared/src/metrics/payload.js';

const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const MIN_FLUSH_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CAPACITY = 5_000;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

export interface WebEvaluationMetricsHookOptions {
  authHeader: string;
  metricsUrl: string;
  flushIntervalMs?: number;
  maxCapacity?: number;
  sdkVersion: string;
  providerName: string;
}

/** Web best-effort metrics delivery: periodic flush, visibility/sendBeacon, keepalive fetch. */
export class WebEvaluationMetricsHook {
  /** Metrics ingest endpoint (exposed for testing). */
  readonly metricsUrl: string;

  private readonly _authHeader: string;
  private readonly _flushIntervalMs: number;
  private readonly _maxCapacity: number;
  private readonly _sdkVersion: string;
  private readonly _providerName: string;

  private readonly _aggregator: MetricsAggregator;
  readonly hook: MetricsHook;

  private _periodicTimer: ReturnType<typeof setInterval> | undefined;
  private _visibilityHandler: (() => void) | undefined;

  constructor(options: WebEvaluationMetricsHookOptions) {
    this.metricsUrl = options.metricsUrl;
    this._authHeader = options.authHeader;
    const intervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this._flushIntervalMs = intervalMs < 0 ? intervalMs : Math.max(intervalMs, MIN_FLUSH_INTERVAL_MS);
    this._maxCapacity = options.maxCapacity ?? DEFAULT_MAX_CAPACITY;
    this._sdkVersion = options.sdkVersion;
    this._providerName = options.providerName;

    // web delivers best-effort metrics; unlike the server providers it does not
    // gate on config version (CDN config isn't versioned on the browser path)
    this._aggregator = new MetricsAggregator({ gateOnVersion: false });
    this.hook = new MetricsHook(this._aggregator, {
      onRecord: () => this._maybeCapacityFlush(),
    });

    this._startPeriodicFlush();
    this._registerVisibilityHandler();
  }

  setConfigVersion(version: string | number | undefined | null): void {
    this._aggregator.setVersion(version);
  }

  flush(useBeacon = false): void {
    const batch = this._aggregator.drain();
    if (batch.isEmpty()) {
      return;
    }

    const payload = buildPayload(batch.evaluations, {
      version: batch.version,
      sdkType: 'web',
      sdkVersion: this._sdkVersion,
      providerName: this._providerName,
      includeConfigVersion: true,
    });

    if (useBeacon) {
      this._sendBeacon(payload);
    } else {
      this._sendWithRetry(payload, 0);
    }
  }

  destroy(): void {
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

  private _maybeCapacityFlush(): void {
    if (this._aggregator.bucketCount() >= this._maxCapacity) {
      this.flush();
    }
  }

  private _sendBeacon(payload: FlushPayload): void {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
      return;
    }
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(this.metricsUrl, blob);
  }

  private _sendWithRetry(payload: FlushPayload, attempt: number): void {
    fetch(this.metricsUrl, {
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
    if (typeof setInterval === 'undefined' || this._flushIntervalMs < 0) {
      return;
    }
    this._periodicTimer = setInterval(() => this.flush(), this._flushIntervalMs);
  }

  private _registerVisibilityHandler(): void {
    if (typeof document === 'undefined') {
      return;
    }
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        this.flush(true);
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }
}
