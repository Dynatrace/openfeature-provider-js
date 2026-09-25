/** `eventStreams[].type` value identifying the SSE change-notification stream. */
export const STREAM_TYPE_SSE = 'sse';

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
  let parsed: unknown;
  try {
    parsed = JSON.parse(configJson);
  } catch {
    return null;
  }

  const streams = (parsed as { eventStreams?: unknown } | null)?.eventStreams;
  if (!Array.isArray(streams)) {
    return null;
  }

  for (const entry of streams as EventStream[]) {
    if (entry == null || entry.type !== STREAM_TYPE_SSE) {
      continue;
    }

    if (isNonBlank(entry.url)) {
      return entry.url.trim();
    }

    const endpoint = entry.endpoint as Endpoint | undefined;
    if (endpoint != null && isNonBlank(endpoint.requestUri)) {
      const origin = isNonBlank(endpoint.origin) ? endpoint.origin.trim() : fallbackOrigin;
      return isNonBlank(origin) ? origin.trim() + endpoint.requestUri.trim() : null;
    }

    // Only the first `sse` entry counts, even when it is unusable.
    return null;
  }

  return null;
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
