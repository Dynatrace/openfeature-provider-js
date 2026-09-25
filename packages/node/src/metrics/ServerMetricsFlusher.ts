import type { Logger } from '@openfeature/server-sdk';
import { resolveLogger } from '../../../shared/src/logger.js';
import type { DrainedBatch, MetricsAggregator } from '../../../shared/src/metrics/aggregator.js';
import { buildPayload } from '../../../shared/src/metrics/payload.js';
import type { FetchFn } from '../cdnFetcher.js';
import { DEFAULT_METRICS_FLUSH_INTERVAL_MS, DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS } from '../options.js';

export const METRICS_HTTP_TIMEOUT_MS = 10_000;
export const FAILED_CAPACITY_RETRY_COOLDOWN_MS = 30_000;
export const MAX_SEALED_BATCHES = 10;

export interface ServerMetricsFlusherOptions {
  aggregator: MetricsAggregator;
  sdkKey: string;
  metricsUrl: string;
  flushIntervalMs?: number;
  softCapDistinctFlags?: number;
  sdkVersion: string;
  providerName: string;
  fetch?: FetchFn;
  now?: () => number;
  logger?: Logger;
}

/**
 * Server-side evaluation metrics flusher: periodic delivery, capacity-triggered flush,
 * version-sealed batches on config rotation, and a final flush on shutdown.
 *
 * All HTTP work is serialized on an internal queue and never runs on the evaluation path.
 */
export class ServerMetricsFlusher {
  private readonly _aggregator: MetricsAggregator;
  private readonly _authHeader: string;
  private readonly _metricsUrl: string;
  private readonly _flushIntervalMs: number;
  private readonly _softCapDistinctFlags: number;
  private readonly _sdkVersion: string;
  private readonly _providerName: string;
  private readonly _fetch: FetchFn;
  private readonly _now: () => number;

  private readonly _sealedBatches: DrainedBatch[] = [];
  private _sealedBatchCount = 0;
  private _started = false;
  private _shutdown = false;
  private _outOfBandFlushScheduled = false;
  private _nextOutOfBandFlushAllowedMs = 0;
  private _periodicTimer: ReturnType<typeof setInterval> | undefined;
  private _workerChain: Promise<void> = Promise.resolve();
  private readonly _logger: Logger;

  constructor(options: ServerMetricsFlusherOptions) {
    this._aggregator = options.aggregator;
    this._authHeader = `Bearer ${options.sdkKey}`;
    this._metricsUrl = options.metricsUrl;
    this._flushIntervalMs = options.flushIntervalMs ?? DEFAULT_METRICS_FLUSH_INTERVAL_MS;
    this._softCapDistinctFlags = options.softCapDistinctFlags ?? DEFAULT_METRICS_SOFT_CAP_DISTINCT_FLAGS;
    this._sdkVersion = options.sdkVersion;
    this._providerName = options.providerName;
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this._now = options.now ?? (() => Date.now());
    this._logger = options.logger ?? resolveLogger();
  }

  /**
   * Starts periodic flushing. Idempotent, and able to revive a flusher that was shut down:
   * the provider reuses one instance across initialize/onClose/initialize cycles.
   */
  start(): void {
    if (this._periodicTimer != null) {
      return;
    }
    this._shutdown = false;
    this._started = true;
    this._periodicTimer = setInterval(() => this._scheduleFlushQuietly(), this._flushIntervalMs);
  }

  /** Accepts a pre-drained batch for FIFO delivery ahead of the live aggregator. */
  enqueueSealedBatch(batch: DrainedBatch): void {
    if (this._shutdown) {
      // Nothing is left to drain the queue, so accepting the batch would only hide the drop.
      return;
    }
    if (batch == null || batch.isEmpty()) {
      return;
    }
    if (this._sealedBatchCount + 1 > MAX_SEALED_BATCHES) {
      this._logger.warn(`dropping a sealed metrics batch; the queue is at its ${MAX_SEALED_BATCHES} batch limit`);
      return;
    }
    this._sealedBatchCount++;
    this._sealedBatches.push(batch);
  }

  /** Schedules an out-of-band flush without coalescing (config rotation, shutdown-style paths). */
  triggerFlush(): void {
    if (this._shutdown) {
      return;
    }
    this._scheduleFlushQuietly();
  }

  /** Capacity callback from the metrics hook after each evaluation. Never blocks. */
  onRecord(): void {
    if (!this._started || this._shutdown) {
      return;
    }
    if (this._aggregator.flagCount() < this._softCapDistinctFlags) {
      return;
    }
    if (this._now() < this._nextOutOfBandFlushAllowedMs) {
      return;
    }
    this._scheduleCapacityFlush();
  }

  /** Performs a final synchronous flush and stops the scheduler. Idempotent. */
  async shutdown(): Promise<void> {
    if (this._shutdown) {
      return;
    }
    this._shutdown = true;

    if (this._periodicTimer != null) {
      clearInterval(this._periodicTimer);
      this._periodicTimer = undefined;
    }

    await this._runFlushQuietly();
  }

  private _scheduleCapacityFlush(): void {
    if (this._outOfBandFlushScheduled) {
      return;
    }
    this._outOfBandFlushScheduled = true;
    this._workerChain = this._workerChain
      .then(async () => {
        try {
          await this._flush();
        } finally {
          this._outOfBandFlushScheduled = false;
        }
      })
      .catch(() => {
        this._outOfBandFlushScheduled = false;
      });
  }

  private _scheduleFlushQuietly(): void {
    this._workerChain = this._workerChain.then(() => this._flushQuietly()).catch(() => {});
  }

  private _runFlushQuietly(): Promise<void> {
    return new Promise((resolve) => {
      this._workerChain = this._workerChain
        .then(async () => {
          await this._flushQuietly();
        })
        .catch(() => {})
        .then(resolve, resolve);
    });
  }

  private async _flushQuietly(): Promise<void> {
    try {
      await this._flush();
    } catch {
      // Delivery failures are handled inside flushBatch; unexpected throws must not crash the worker.
    }
  }

  private async _flush(): Promise<void> {
    while (this._sealedBatches.length > 0) {
      const sealed = this._sealedBatches[0];
      let delivered = false;
      try {
        delivered = await this._flushBatch(sealed);
      } finally {
        if (delivered) {
          this._sealedBatches.shift();
          this._sealedBatchCount--;
        }
      }
      if (!delivered) {
        return;
      }
    }

    const live = this._aggregator.drain();
    if (live.isEmpty()) {
      return;
    }

    let delivered = false;
    try {
      delivered = await this._flushBatch(live);
    } finally {
      if (!delivered) {
        // Rotations during the failed POST can have filled the queue. The retry keeps its
        // place at the head, so make room by dropping the newest seal instead: delivery
        // stays in version order and the batch that already cost a request is not the one
        // thrown away.
        if (this._sealedBatchCount >= MAX_SEALED_BATCHES) {
          this._sealedBatches.pop();
          this._sealedBatchCount--;
        }
        this._sealedBatchCount++;
        this._sealedBatches.unshift(live);
      }
    }
  }

  private async _flushBatch(batch: DrainedBatch): Promise<boolean> {
    const payload = buildPayload(batch.evaluations, {
      version: batch.version,
      sdkType: 'server',
      sdkVersion: this._sdkVersion,
      providerName: this._providerName,
    });

    try {
      const response = await this._fetch(this._metricsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._authHeader,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(METRICS_HTTP_TIMEOUT_MS),
      });

      if (response.status >= 200 && response.status < 300) {
        this._nextOutOfBandFlushAllowedMs = 0;
        return true;
      }
      if (response.status === 400) {
        // The server rejected the payload itself, so a retry would fail identically.
        this._logger.warn(
          `metrics batch rejected as invalid (HTTP 400); dropping ${batch.evaluations.size} flag entries`,
        );
        return true;
      }
      this._logger.warn(`metrics flush returned HTTP ${response.status}; retrying on the next flush`);
    } catch (err) {
      // Transport errors and timeouts are retried on the next flush cycle.
      const message = err instanceof Error ? err.message : String(err);
      this._logger.warn(`metrics flush failed: ${message}`);
    }

    this._nextOutOfBandFlushAllowedMs = this._now() + FAILED_CAPACITY_RETRY_COOLDOWN_MS;
    return false;
  }
}
