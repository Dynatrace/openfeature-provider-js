import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CdnFetcher,
  HEADER_ETAG,
  HEADER_IF_MODIFIED_SINCE,
  HEADER_IF_NONE_MATCH,
  HEADER_LAST_MODIFIED,
  HEADER_RETRY_AFTER,
  parseRetryAfterMs,
} from './cdnFetcher';
import { RetryStrategy } from './retry';

const MINIMAL_FLAGS_BODY = '{"flags":{}}';
const TEST_ETAG = '"abc123"';
const LAST_MODIFIED_OLD = 'Mon, 01 Jan 2024 00:00:00 GMT';
const LAST_MODIFIED_NEW = 'Wed, 02 Apr 2025 12:00:00 GMT';
const CDN_URL = 'https://cdn.us.fm.dynatrace.com/server/key.json';

function makeHeaders(values: Record<string, string>): Headers {
  return new Headers(values);
}

function makeResponse(status: number, options: { body?: string; headers?: Record<string, string> } = {}): Response {
  const headers = options.headers != null ? makeHeaders(options.headers) : undefined;
  if (status === 304) {
    return {
      status: 304,
      headers: headers ?? new Headers(),
      text: async () => '',
    } as Response;
  }
  return new Response(options.body ?? '', { status, headers });
}

function noDelayRetry(): RetryStrategy {
  return new RetryStrategy({ maxAttempts: 5, baseDelayMs: 0, maxJitterFactor: 0, sleep: () => {} });
}

describe('parseRetryAfterMs', () => {
  it('parses seconds', () => {
    expect(parseRetryAfterMs('30')).toBe(30_000);
  });

  it('defaults when missing or invalid', () => {
    expect(parseRetryAfterMs(null)).toBe(60_000);
    expect(parseRetryAfterMs('')).toBe(60_000);
    expect(parseRetryAfterMs('not-a-date')).toBe(60_000);
  });
});

describe('CdnFetcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  function fetcher(retry = noDelayRetry()): CdnFetcher {
    return new CdnFetcher(CDN_URL, retry, fetchMock as typeof fetch);
  }

  it('returns body, etag, and last-modified on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(200, {
        body: MINIMAL_FLAGS_BODY,
        headers: {
          [HEADER_ETAG]: TEST_ETAG,
          [HEADER_LAST_MODIFIED]: LAST_MODIFIED_OLD,
        },
      }),
    );

    const result = await fetcher().fetch();

    expect(result.status).toBe(200);
    expect(result.body).toBe(MINIMAL_FLAGS_BODY);
    expect(result.etag).toBe(TEST_ETAG);
    expect(result.lastModified).toBe(LAST_MODIFIED_OLD);
  });

  it('sends conditional headers on subsequent fetches', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: MINIMAL_FLAGS_BODY,
          headers: {
            [HEADER_ETAG]: TEST_ETAG,
            [HEADER_LAST_MODIFIED]: LAST_MODIFIED_OLD,
          },
        }),
      )
      .mockResolvedValueOnce(makeResponse(304));

    const client = fetcher();
    await client.fetch();
    await client.fetch();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = secondInit.headers as Headers;
    expect(headers.get(HEADER_IF_NONE_MATCH)).toBe(TEST_ETAG);
    expect(headers.get(HEADER_IF_MODIFIED_SINCE)).toBe(LAST_MODIFIED_OLD);
  });

  it('does not send conditional headers on first fetch', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, { body: '{}' }));

    await fetcher().fetch();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get(HEADER_IF_NONE_MATCH)).toBeNull();
    expect(headers.get(HEADER_IF_MODIFIED_SINCE)).toBeNull();
  });

  it('returns 304 with null body', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: MINIMAL_FLAGS_BODY,
          headers: {
            [HEADER_ETAG]: TEST_ETAG,
            [HEADER_LAST_MODIFIED]: LAST_MODIFIED_OLD,
          },
        }),
      )
      .mockResolvedValueOnce(makeResponse(304));

    const client = fetcher();
    await client.fetch();
    const result = await client.fetch();

    expect(result.status).toBe(304);
    expect(result.body).toBeNull();
  });

  it('retries 5xx and returns the last status', async () => {
    fetchMock.mockResolvedValue(makeResponse(503));

    const result = await fetcher().fetch();

    expect(result.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('recovers from 5xx on retry', async () => {
    fetchMock
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: MINIMAL_FLAGS_BODY,
          headers: { [HEADER_ETAG]: TEST_ETAG },
        }),
      );

    const result = await fetcher().fetch();

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sets rate limit window on 429 and skips subsequent network calls', async () => {
    let now = 1_000_000;
    fetchMock.mockResolvedValueOnce(
      makeResponse(429, {
        headers: { [HEADER_RETRY_AFTER]: '60' },
      }),
    );

    const client = new CdnFetcher(CDN_URL, noDelayRetry(), fetchMock as typeof fetch, () => now);
    const first = await client.fetch();
    expect(first.status).toBe(429);
    expect(client.isRateLimited()).toBe(true);

    const second = await client.fetch();
    expect(second.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now += 60_000;
    expect(client.isRateLimited()).toBe(false);
  });

  it('does not retry 429 responses', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(429, {
        headers: { [HEADER_RETRY_AFTER]: '30' },
      }),
    );

    await fetcher().fetch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a skipped result when a concurrent fetch is already in progress', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const client = fetcher();
    const inFlight = client.fetch();
    const concurrent = await client.fetch();
    expect(concurrent.skipped).toBe(true);
    // Must not masquerade as a 304: the caller has to be able to tell "we never asked"
    // apart from "the CDN confirmed our config is current".
    expect(concurrent.status).not.toBe(304);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(makeResponse(200, { body: MINIMAL_FLAGS_BODY, headers: { [HEADER_ETAG]: TEST_ETAG } }));
    await inFlight;
  });

  it('treats older Last-Modified as 304 (stale-node defense)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: MINIMAL_FLAGS_BODY,
          headers: {
            [HEADER_ETAG]: TEST_ETAG,
            [HEADER_LAST_MODIFIED]: LAST_MODIFIED_NEW,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: 'stale-body',
          headers: {
            [HEADER_ETAG]: '"stale-etag"',
            [HEADER_LAST_MODIFIED]: LAST_MODIFIED_OLD,
          },
        }),
      );

    const client = fetcher();
    await client.fetch();
    const result = await client.fetch();

    expect(result.status).toBe(304);
    expect(result.body).toBeNull();
  });

  it('accepts 200 responses without Last-Modified', async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: MINIMAL_FLAGS_BODY,
          headers: {
            [HEADER_ETAG]: TEST_ETAG,
            [HEADER_LAST_MODIFIED]: LAST_MODIFIED_OLD,
          },
        }),
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          body: 'new-body',
          headers: { [HEADER_ETAG]: '"new-etag"' },
        }),
      );

    const client = fetcher();
    await client.fetch();
    const result = await client.fetch();

    expect(result.status).toBe(200);
    expect(result.body).toBe('new-body');
  });

  it('aborts in-flight fetch when signal is cancelled', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
          if (signal?.aborted) {
            reject(new DOMException('The operation was aborted', 'AbortError'));
            return;
          }
          setTimeout(() => {
            resolve(
              makeResponse(200, {
                body: MINIMAL_FLAGS_BODY,
                headers: { [HEADER_ETAG]: TEST_ETAG },
              }),
            );
          }, 50);
        }),
    );

    const abortController = new AbortController();
    const client = fetcher();
    const pending = client.fetch(abortController.signal);
    abortController.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
