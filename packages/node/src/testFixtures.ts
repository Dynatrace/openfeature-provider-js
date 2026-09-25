import { vi } from 'vitest';
import type { SseEventSource } from './sseManager.js';

export { VALID_SERVER_KEY } from '../../shared/src/testKeys.js';

export const TEST_FLAG_JSON = JSON.stringify({
  metadata: {
    version: '1741780800',
  },
  flags: {
    'my-bool': {
      state: 'ENABLED',
      variants: { on: true, off: false },
      defaultVariant: 'on',
    },
    'my-string': {
      state: 'ENABLED',
      variants: { hello: 'world' },
      defaultVariant: 'hello',
    },
  },
});

export const SSE_URL = 'https://sse.us.fm.dynatrace.com/event-stream?v=1.2&key=SECRET&channels=chan-1';
export const ROTATED_SSE_URL = 'https://sse.us.fm.dynatrace.com/event-stream?v=1.2&key=ROTATED&channels=chan-1';

/** The CDN body with an `eventStreams` entry in the structured shape fm-service emits. */
export function flagJsonWithSse(sseUrl: string = SSE_URL, version = '1741780800'): string {
  const parsed = JSON.parse(TEST_FLAG_JSON) as Record<string, unknown>;
  const { origin, pathname, search } = new URL(sseUrl);
  return JSON.stringify({
    ...parsed,
    metadata: { version },
    eventStreams: [{ type: 'sse', endpoint: { origin, requestUri: `${pathname}${search}` } }],
  });
}

/** Stand-in for `EventSource` that lets a test drive the stream by hand. */
export class FakeEventSource implements SseEventSource {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { code?: number; message?: string }) => void) | null = null;
  closed = false;

  close(): void {
    this.closed = true;
  }
}

export interface CdnResponse {
  status?: number;
  body?: string;
  lastModified?: string;
}

/**
 * A `fetch` that short-circuits metrics POSTs and answers CDN requests from a response script,
 * repeating the last entry once the script runs out.
 */
export function createCdnFetch(responses: CdnResponse[]): typeof fetch {
  let index = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST' && String(input).includes('/v1/metrics')) {
      return new Response(null, { status: 202 });
    }
    const response = responses[Math.min(index, responses.length - 1)];
    index++;
    const headers: Record<string, string> = { ETag: `"v${index}"` };
    if (response.lastModified != null) {
      headers['Last-Modified'] = response.lastModified;
    }
    return new Response(response.body ?? null, { status: response.status ?? 200, headers });
  }) as typeof fetch;
}
