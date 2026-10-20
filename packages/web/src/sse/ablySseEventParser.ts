import { defaultSseEventParser } from '@openfeature/ofrep-web-provider';
import type { EventStreamMessage } from '@openfeature/ofrep-core';
import { unwrapSseData } from '../../../shared/src/sse/sseMessage.js';

/**
 * Parses an SSE `MessageEvent` delivered by Ably into an OFREP
 * {@link EventStreamMessage}.
 *
 * Ably channel SSE sends the Ably protocol message as the SSE `data:` field.
 * The OFREP payload is the published `data` property of that message:
 *
 * ```json
 * {
 *   "id": "...",
 *   "channel": "...",
 *   "name": "refetchEvaluation",
 *   "data": "{\"type\":\"refetchEvaluation\",\"etag\":\"...\",\"lastModified\":123}"
 * }
 * ```
 */
export function parseAblySseEvent(event: MessageEvent<string>): EventStreamMessage {
  const inner = unwrapSseData(event.data);
  return defaultSseEventParser(inner ? ({ data: inner } as MessageEvent) : event);
}
