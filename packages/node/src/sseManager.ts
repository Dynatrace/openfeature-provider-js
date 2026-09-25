import type { Logger } from '@openfeature/server-sdk';
import { EventSource } from 'eventsource';
import { resolveLogger } from '../../shared/src/logger.js';
import { parseSseMessage, type SseMessage } from '../../shared/src/sse/sseMessage.js';

/**
 * The slice of `EventSource` the manager uses.
 *
 * Narrower than the real thing on purpose: it keeps the fake in tests honest, and it lets a host
 * substitute another implementation (Node's own global `EventSource`, a proxy-aware client)
 * without this package depending on its exact type.
 */
export interface SseEventSource {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: { code?: number; message?: string }) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => SseEventSource;

export const defaultEventSourceFactory: EventSourceFactory = (url) => new EventSource(url) as SseEventSource;

export interface SseCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (message: SseMessage) => void;
}

/**
 * Strips the query string before logging a stream URL.
 *
 * The URL fm-service advertises carries the Ably channel key as a query parameter, so the raw
 * value is a credential and must never reach a log sink.
 */
export function maskSseUrl(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart >= 0 ? `${url.slice(0, queryStart)}?<redacted>` : url;
}

/**
 * Holds the SSE connection that notifies the provider when its config changes.
 *
 * Reconnection is the underlying `EventSource`'s job (providers.md 2.5): it retries with its own
 * backoff and reports each attempt through `onerror`, so this class deliberately has no retry
 * logic of its own. It reports faults verbatim and leaves the debounce-and-escalate decision to
 * the provider, which is the only place that knows whether a fault is worth going `STALE` over.
 *
 * Messages are parsed here and dropped when unparseable — a malformed payload is not evidence
 * that the stream is unhealthy, so it never surfaces as a disconnect.
 */
export class SseManager {
  private _source: SseEventSource | undefined;
  private _stopped = false;

  private readonly _logger: Logger;

  constructor(
    private readonly _url: string,
    private readonly _callbacks: SseCallbacks,
    private readonly _createEventSource: EventSourceFactory = defaultEventSourceFactory,
    logger?: Logger,
  ) {
    this._logger = logger ?? resolveLogger();
  }

  /** The stream URL this manager was built for; the provider compares it to spot a rotation. */
  get url(): string {
    return this._url;
  }

  start(): void {
    if (this._stopped || this._source != null) {
      return;
    }

    const source = this._createEventSource(this._url);
    this._source = source;

    source.onopen = () => {
      if (this._stopped) {
        return;
      }
      this._logger.info(`SSE connection opened (${maskSseUrl(this._url)})`);
      this._callbacks.onConnected();
    };

    source.onmessage = (event) => {
      if (this._stopped) {
        return;
      }
      const message = parseSseMessage(event?.data);
      if (message == null) {
        this._logger.debug('SSE message dropped: payload was not a recognisable envelope');
        return;
      }
      this._logger.debug(`SSE message received (type=${message.type}, lastModified=${message.lastModified ?? 'none'})`);
      this._callbacks.onMessage(message);
    };

    source.onerror = (event) => {
      if (this._stopped) {
        return;
      }
      const status = event?.code != null ? ` status ${event.code},` : '';
      this._logger.warn(`SSE connection error (${maskSseUrl(this._url)}):${status} ${event?.message ?? 'no message'}`);
      this._callbacks.onDisconnected();
    };
  }

  /**
   * Closes the connection. Idempotent, and permanent for this instance: the handlers are detached
   * first so a close that races an in-flight event cannot deliver it to a provider that has
   * already moved on to a new lifecycle or a rotated URL.
   */
  stop(): void {
    this._stopped = true;
    const source = this._source;
    if (source == null) {
      return;
    }
    this._source = undefined;
    source.onopen = null;
    source.onmessage = null;
    source.onerror = null;
    try {
      source.close();
    } catch (err) {
      this._logger.debug(`closing the SSE connection threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    this._logger.info('SSE connection closed');
  }
}
