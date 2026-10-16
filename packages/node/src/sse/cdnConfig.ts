import { safeJsonParse } from '../../../shared/src/sse/sseMessage.js';

/** `eventStreams[].type` value identifying the SSE change-notification stream. */
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

/**
 * Resolves the SSE URL from the config's first `sse` entry in `eventStreams`, or `null`.
 * A flat `url` wins; otherwise `endpoint.requestUri` is appended to `endpoint.origin`, or to
 * `fallbackOrigin` when the entry omits one. Unknown attributes are ignored.
 */
export function sseUrlFrom(configJson: string, fallbackOrigin?: string): string | null {
  const streams = (safeJsonParse(configJson) as { eventStreams?: unknown } | undefined)?.eventStreams;
  if (!Array.isArray(streams)) {
    return null;
  }

  // Only the first `sse` entry counts, even when it turns out to be unusable.
  const entry = (streams as EventStream[]).find((candidate) => candidate?.type === STREAM_TYPE_SSE);
  if (entry == null) {
    return null;
  }
  if (isNonBlank(entry.url)) {
    return entry.url.trim();
  }

  const endpoint = entry.endpoint as Endpoint | undefined;
  if (endpoint == null || !isNonBlank(endpoint.requestUri)) {
    return null;
  }
  const origin = isNonBlank(endpoint.origin) ? endpoint.origin.trim() : fallbackOrigin;
  return isNonBlank(origin) ? origin.trim() + endpoint.requestUri.trim() : null;
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
