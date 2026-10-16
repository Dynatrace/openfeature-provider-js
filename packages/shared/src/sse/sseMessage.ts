/** Server-side signal to re-fetch the flagd config JSON from the CDN. */
export const SSE_TYPE_REFETCH_CONFIG = 'refetchConfig';

/** SSE message envelope per the spec. `metadata` is deliberately not exposed. */
export interface SseMessage {
  /** Discriminator; callers ignore types they do not recognise. */
  type: string;
  /** Quoted ETag of the new upstream resource. */
  etag?: string;
  /** Unix epoch seconds, used to drop out-of-order messages. */
  lastModified?: number;
}

/** `JSON.parse` that yields `undefined` instead of throwing. */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Returns the inner payload of the Ably frame wrapping an SSE message, or `null` when the payload
 * is not a frame. Ably carries the real message as a JSON-encoded string under `data`.
 */
export function unwrapSseData(data: unknown): string | null {
  const frame = typeof data === 'string' ? safeJsonParse(data) : data;
  if (frame != null && typeof frame === 'object' && typeof (frame as { data?: unknown }).data === 'string') {
    return (frame as { data: string }).data;
  }
  return null;
}

/**
 * Parses an SSE payload, accepting the Ably envelope or the flat spec shape. Returns `null` for
 * invalid JSON or a blank `type`, which callers drop rather than treating as a stream fault.
 */
export function parseSseMessage(data: unknown): SseMessage | null {
  const outer = typeof data === 'string' ? safeJsonParse(data) : data;
  if (outer == null || typeof outer !== 'object') {
    return null;
  }

  const inner =
    typeof (outer as { data?: unknown }).data === 'string' ? safeJsonParse((outer as { data: string }).data) : outer;
  if (inner == null || typeof inner !== 'object') {
    return null;
  }

  const { type, etag, lastModified } = inner as Record<string, unknown>;
  if (typeof type !== 'string' || type.trim() === '') {
    return null;
  }

  return {
    type,
    etag: typeof etag === 'string' ? etag : undefined,
    lastModified: typeof lastModified === 'number' && Number.isFinite(lastModified) ? lastModified : undefined,
  };
}
