/** server-side signal to re-fetch the flagd config from the CDN */
export const SSE_TYPE_REFETCH_CONFIG = 'refetchConfig';

/** SSE message envelope per the spec; `metadata` deliberately omitted */
export interface SseMessage {
  /** discriminator; unknown types are ignored */
  type: string;
  /** quoted ETag of the new resource */
  etag?: string;
  /** wire `lastModified`, epoch seconds per the spec; providers compare in ms */
  lastModifiedSeconds?: number;
}

/** `JSON.parse` that returns `undefined` instead of throwing */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** inner payload of an Ably frame (a JSON string under `data`); `undefined` if not a frame */
export function unwrapSseData(data: unknown): string | undefined {
  const frame = typeof data === 'string' ? safeJsonParse(data) : data;
  if (frame && typeof frame === 'object' && typeof (frame as { data?: unknown }).data === 'string') {
    return (frame as { data: string }).data;
  }
  return undefined;
}

/** parses the Ably envelope or the flat shape; `undefined` for invalid JSON or a blank `type` */
export function parseSseMessage(data: unknown): SseMessage | undefined {
  const outer = typeof data === 'string' ? safeJsonParse(data) : data;
  if (!outer || typeof outer !== 'object') {
    return undefined;
  }

  const inner =
    typeof (outer as { data?: unknown }).data === 'string' ? safeJsonParse((outer as { data: string }).data) : outer;
  if (!inner || typeof inner !== 'object') {
    return undefined;
  }

  const { type, etag, lastModified } = inner as Record<string, unknown>;
  if (typeof type !== 'string' || type.trim() === '') {
    return undefined;
  }

  return {
    type,
    etag: typeof etag === 'string' ? etag : undefined,
    lastModifiedSeconds: typeof lastModified === 'number' && Number.isFinite(lastModified) ? lastModified : undefined,
  };
}
