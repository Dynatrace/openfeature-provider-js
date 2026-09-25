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
