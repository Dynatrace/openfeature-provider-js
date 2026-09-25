/** Server-side signal to re-fetch the flagd config JSON from the CDN. */
export const SSE_TYPE_REFETCH_CONFIG = 'refetchConfig';

/** Client-side signal to re-fetch bulk evaluations from the OFREP endpoint. */
export const SSE_TYPE_REFETCH_EVALUATION = 'refetchEvaluation';

/**
 * Parsed SSE message envelope per the fm-knowledge-base SSE message format spec.
 *
 * `metadata` is intentionally not exposed: the spec defines it as type-specific extension data
 * that providers must not forward to OFREP clients.
 */
export interface SseMessage {
  /** Message discriminator. Callers must ignore types they do not recognise. */
  type: string;
  /** Quoted ETag of the new upstream resource, when the producer sent one. */
  etag?: string;
  /** Unix epoch seconds. Used to drop out-of-order messages. */
  lastModified?: number;
}

/**
 * Unwraps the Ably protocol frame around an SSE payload, returning the inner payload.
 *
 * Ably delivers its own message as the SSE `data:` field, with the published payload as a
 * JSON-encoded string under `data`:
 *
 * ```json
 * { "id": "...", "channel": "...", "name": "refetchConfig", "data": "{\"type\":\"refetchConfig\"}" }
 * ```
 *
 * Anything that is not that shape is returned untouched, so a flat payload (what the spec
 * describes, and what the mock server sends) passes straight through.
 */
export function unwrapSseData(data: unknown): unknown {
  const frame = typeof data === 'string' ? safeJsonParse(data) : data;
  if (frame != null && typeof frame === 'object' && typeof (frame as { data?: unknown }).data === 'string') {
    return (frame as { data: string }).data;
  }
  return data;
}

/**
 * Parses an SSE payload into an {@link SseMessage}, accepting either the Ably envelope or the
 * flat spec shape.
 *
 * Returns `null` when the payload is not valid JSON or carries no non-blank `type`. Callers log
 * and drop on `null` rather than tearing down the stream: an unparseable message says nothing
 * about the health of the connection that delivered it.
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
