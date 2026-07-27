import { defaultSseEventParser } from '@openfeature/ofrep-web-provider';
import type { EventStreamMessage } from '@openfeature/ofrep-core';

/**
 * Parses an SSE `MessageEvent` delivered by Ably into an OFREP
 * {@link EventStreamMessage}.
 *
 * Ably wraps the OFREP payload in a double-nested `data` structure. A raw SSE
 * frame looks like:
 *
 * ```json
 * {
 *   "id": "S!...",
 *   "event": "message",
 *   "data": {                         // Ably message envelope
 *     "...": "....",
 *     "data": "{\"key\":true}"        // the actual OFREP payload (JSON string)
 *   }
 * }
 * ```
 *
 * The `MessageEvent.data` may arrive either as a JSON string (standard
 * `EventSource` behavior) or as an already-deserialized object (some
 * `EventSource` implementations). This parser unwraps the outer frame, reaches
 * into the Ably envelope's nested `data`, and delegates the final
 * string-or-object parse to {@link defaultSseEventParser}.
 */
export function parseAblySseEvent(event: MessageEvent): EventStreamMessage {
  // Outer frame: the SSE `data:` field (Ably message envelope).
  const frame = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

  // Ably envelope carries the real OFREP payload in its own nested `data`.
  const payload = frame?.data?.data;
  if (payload === undefined) {
    throw new Error('Ably SSE event missing nested data payload');
  }

  // defaultSseEventParser JSON-parses when the payload is a string, otherwise
  // returns it as-is. It reads `.data` off its argument, so wrap the payload.
  return defaultSseEventParser({ data: payload } as MessageEvent);
}
