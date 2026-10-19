import { safeJsonParse } from '../../../shared/src/sse/sseMessage.js';

/** `eventStreams[].type` of the SSE stream */
const STREAM_TYPE_SSE = 'sse';

interface Endpoint {
  origin?: unknown;
  requestUri?: unknown;
}

interface EventStream {
  type?: unknown;
  url?: unknown;
  endpoint?: unknown;
}

/** first `sse` entry's `url`, else `endpoint.origin` (or `fallbackOrigin`) + `requestUri` */
export function extractSseUrl(configJson: string, fallbackOrigin?: string): string | undefined {
  const streams = (safeJsonParse(configJson) as { eventStreams?: unknown } | undefined)?.eventStreams;
  if (!Array.isArray(streams)) {
    return undefined;
  }

  // only the first `sse` entry counts, even if unusable
  const entry = (streams as EventStream[]).find((candidate) => candidate?.type === STREAM_TYPE_SSE);
  if (!entry) {
    return undefined;
  }
  if (isNonBlank(entry.url)) {
    return entry.url.trim();
  }

  const endpoint = entry.endpoint as Endpoint | undefined;
  if (!endpoint || !isNonBlank(endpoint.requestUri)) {
    return undefined;
  }
  const origin = isNonBlank(endpoint.origin) ? endpoint.origin.trim() : fallbackOrigin;
  return isNonBlank(origin) ? origin.trim() + endpoint.requestUri.trim() : undefined;
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
