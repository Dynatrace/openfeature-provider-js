/** Server-side signal to re-fetch the flagd config JSON from the CDN. */
export const SSE_TYPE_REFETCH_CONFIG = 'refetchConfig';

/** Client-side signal to re-fetch bulk evaluations from the OFREP endpoint. */
export const SSE_TYPE_REFETCH_EVALUATION = 'refetchEvaluation';

/** SSE message envelope per the spec. `metadata` is deliberately not exposed. */
export interface SseMessage {
  /** Discriminator; callers ignore types they do not recognise. */
  type: string;
  /** Quoted ETag of the new upstream resource. */
  etag?: string;
  /** Unix epoch seconds, used to drop out-of-order messages. */
  lastModified?: number;
}

/**
 * Unwraps the Ably frame around an SSE payload, which carries the real message as a
 * JSON-encoded string under `data`. A flat payload passes through untouched.
 */
export function unwrapSseData(data: unknown): unknown {
  const frame = typeof data === 'string' ? safeJsonParse(data) : data;
  if (frame != null && typeof frame === 'object' && typeof (frame as { data?: unknown }).data === 'string') {
    return (frame as { data: string }).data;
  }
  return data;
}

/**
 * Parses an SSE payload, accepting the Ably envelope or the flat spec shape. Returns `null` for
 * invalid JSON or a blank `type`, which callers drop rather than treating as a stream fault.
 */
export function parseSseMessage(data: unknown): SseMessage | null {
  const inner = unwrapSseData(data);
  const parsed = typeof inner === 'string' ? safeJsonParse(inner) : inner;
  if (parsed == null || typeof parsed !== 'object') {
    return null;
  }

  const { type, etag, lastModified } = parsed as Record<string, unknown>;
  if (typeof type !== 'string' || type.trim() === '') {
    return null;
  }

  return {
    type,
    etag: typeof etag === 'string' ? etag : undefined,
    lastModified: typeof lastModified === 'number' && Number.isFinite(lastModified) ? lastModified : undefined,
  };
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
