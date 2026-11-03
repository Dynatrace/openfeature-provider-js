import type { Logger } from '@openfeature/server-sdk';
import { EventSource, type FetchLike } from 'eventsource';
import { resolveLogger } from '../../shared/src/logger.js';
import { parseSseMessage, type SseMessage } from '../../shared/src/sse/sseMessage.js';

/** slice of `EventSource` the manager uses; substitutable in tests */
export interface SseEventSource {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: { code?: number; message?: string }) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => SseEventSource;

/** throws on non-2xx so EventSource retries rather than closing for good (WHATWG) */
export const reconnectingFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`SSE endpoint answered HTTP ${response.status}`);
  }
  return response;
};

// bridges handler variance between the structural type and the class
export const defaultEventSourceFactory: EventSourceFactory = (url) =>
  // no read timeout option; undici's 300s body timeout stands in for 150s
  new EventSource(url, { fetch: reconnectingFetch }) as SseEventSource;

export interface SseCallbacks {
  onConnected: () => void;
  onDisconnected: () => void;
  onMessage: (message: SseMessage) => void;
}

/** strips the query string, which carries the Ably key */
export function maskSseUrl(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart >= 0 ? `${url.slice(0, queryStart)}?<redacted>` : url;
}

/** SSE change-notification stream; reconnects are left to EventSource (providers.md 2.4) */
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

  /** compared by the provider to spot a rotation */
  get url(): string {
    return this._url;
  }

  start(): void {
    if (this._stopped || this._source) {
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
      if (!message) {
        this._logger.debug('SSE message dropped: payload was not a recognisable envelope');
        return;
      }
      this._logger.debug(
        `SSE message received (type=${message.type}, lastModifiedSeconds=${message.lastModifiedSeconds ?? 'none'})`,
      );
      this._callbacks.onMessage(message);
    };

    source.onerror = (event) => {
      const status = event?.code !== undefined ? ` status ${event.code},` : '';
      this._logger.warn(`SSE connection error (${this._maskedUrl}):${status} ${event?.message ?? 'no message'}`);
      this._callbacks.onDisconnected();
    };
  }

  /** closes for good; handlers detached first so a racing event can't reach a newer lifecycle */
  stop(): void {
    this._stopped = true;
    const source = this._source;
    if (!source) {
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
