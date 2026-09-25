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
 * Resolves the SSE URL advertised by the CDN config body, or `null` when there is none.
 *
 * The config carries an `eventStreams` array alongside the flag definitions; the provider takes
 * the first entry whose `type` is `sse`. Two representations are supported, checked in order:
 *
 * 1. **Direct URL** — a non-blank `url`, returned as-is.
 * 2. **Structured endpoint** — a non-blank `endpoint.requestUri` appended to `endpoint.origin`,
 *    falling back to `fallbackOrigin` (the provider's configured config origin) when the config
 *    omits one. This is the shape fm-service emits today.
 *
 * Unknown attributes are ignored so the server can extend an entry without breaking older SDKs.
 * A body that is not valid JSON yields `null`; the caller is already holding a usable config in
 * that case, or is about to reject the body for the same reason.
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

    // The first `sse` entry is the one we honour; an unusable one is not a reason to
    // fall through to a later entry the server did not intend us to prefer.
    return null;
  }

  return null;
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}
