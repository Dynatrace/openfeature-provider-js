import type { Logger } from '@openfeature/server-sdk';
import { EventSource } from 'eventsource';
import { resolveLogger } from '../../shared/src/logger.js';
import { parseSseMessage, type SseMessage } from '../../shared/src/sse/sseMessage.js';

/** The slice of `EventSource` the manager uses, so tests and hosts can substitute one. */
export interface SseEventSource {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: { code?: number; message?: string }) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => SseEventSource;

// The cast bridges the handler variance between this structural type and the concrete class.
export const defaultEventSourceFactory: EventSourceFactory = (url) => new EventSource(url) as SseEventSource;

export interface SseCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (message: SseMessage) => void;
}

/** Strips the query string before logging: it carries the Ably channel key. */
export function maskSseUrl(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart >= 0 ? `${url.slice(0, queryStart)}?<redacted>` : url;
}

/**
 * Holds the SSE connection that notifies the provider when its config changes.
 *
 * Reconnection is the EventSource's job (providers.md 2.5), so faults are reported verbatim and
 * the provider decides whether one is worth going STALE over.
 */
export class SseManager {
  private _source: SseEventSource | undefined;
  private _stopped = false;

  private readonly _logger: Logger;
  private readonly _maskedUrl: string;

  constructor(
    private readonly _url: string,
    private readonly _callbacks: SseCallbacks,
    private readonly _createEventSource: EventSourceFactory = defaultEventSourceFactory,
    logger?: Logger,
  ) {
    this._logger = logger ?? resolveLogger();
    this._maskedUrl = maskSseUrl(_url);
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
      this._logger.info(`SSE connection opened (${this._maskedUrl})`);
      this._callbacks.onConnected();
    };

    source.onmessage = (event) => {
      const message = parseSseMessage(event?.data);
      if (message == null) {
        this._logger.debug('SSE message dropped: payload was not a recognisable envelope');
        return;
      }
      this._logger.debug(`SSE message received (type=${message.type}, lastModified=${message.lastModified ?? 'none'})`);
      this._callbacks.onMessage(message);
    };

    source.onerror = (event) => {
      const status = event?.code != null ? ` status ${event.code},` : '';
      this._logger.warn(`SSE connection error (${this._maskedUrl}):${status} ${event?.message ?? 'no message'}`);
      this._callbacks.onDisconnected();
    };
  }

  /**
   * Closes the connection, permanently for this instance. Handlers are detached first so a racing
   * event cannot reach a provider that has moved on to a new lifecycle or a rotated URL.
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
