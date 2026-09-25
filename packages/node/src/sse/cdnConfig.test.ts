import { describe, it, expect } from 'vitest';
import { sseUrlFrom } from './cdnConfig';

const FALLBACK = 'https://cdn.us.fm.dynatrace.com';

function config(eventStreams: unknown): string {
  return JSON.stringify({ flags: {}, metadata: { version: '1' }, eventStreams });
}

describe('sseUrlFrom', () => {
  it('resolves the structured endpoint shape fm-service emits', () => {
    const json = config([
      {
        type: 'sse',
        endpoint: { origin: 'https://sse.us.fm.dynatrace.com', requestUri: '/event-stream?v=1.2&key=abc&channels=x' },
      },
    ]);
    expect(sseUrlFrom(json, FALLBACK)).toBe('https://sse.us.fm.dynatrace.com/event-stream?v=1.2&key=abc&channels=x');
  });

  it('falls back to the provider origin when the endpoint omits one', () => {
    const json = config([{ type: 'sse', endpoint: { requestUri: '/event-stream?key=abc' } }]);
    expect(sseUrlFrom(json, FALLBACK)).toBe('https://cdn.us.fm.dynatrace.com/event-stream?key=abc');
  });

  it('prefers a flat url over the structured endpoint', () => {
    const json = config([
      { type: 'sse', url: 'https://realtime.ably.io/event-stream?k=1', endpoint: { requestUri: '/ignored' } },
    ]);
    expect(sseUrlFrom(json, FALLBACK)).toBe('https://realtime.ably.io/event-stream?k=1');
  });

  it('ignores unknown attributes on the entry', () => {
    const json = config([{ type: 'sse', url: 'https://realtime.ably.io/x', someFutureField: { nested: true } }]);
    expect(sseUrlFrom(json, FALLBACK)).toBe('https://realtime.ably.io/x');
  });

  it('skips entries of other stream types', () => {
    const json = config([
      { type: 'grpc', url: 'https://grpc.example' },
      { type: 'sse', url: 'https://sse.example' },
    ]);
    expect(sseUrlFrom(json, FALLBACK)).toBe('https://sse.example');
  });

  it.each([
    ['no eventStreams', JSON.stringify({ flags: {} })],
    ['an empty eventStreams array', config([])],
    ['no sse entry', config([{ type: 'grpc', url: 'https://grpc.example' }])],
    ['an sse entry with nothing usable', config([{ type: 'sse' }])],
    ['a blank url and no endpoint', config([{ type: 'sse', url: '   ' }])],
    ['eventStreams that is not an array', JSON.stringify({ eventStreams: { type: 'sse' } })],
    ['unparseable JSON', 'not json'],
  ])('returns null for %s', (_label, json) => {
    expect(sseUrlFrom(json, FALLBACK)).toBeNull();
  });

  it('returns null when the endpoint has no origin and no fallback is available', () => {
    expect(sseUrlFrom(config([{ type: 'sse', endpoint: { requestUri: '/event-stream' } }]))).toBeNull();
  });

  it('does not fall through to a later sse entry when the first is unusable', () => {
    const json = config([{ type: 'sse' }, { type: 'sse', url: 'https://sse.example' }]);
    expect(sseUrlFrom(json, FALLBACK)).toBeNull();
  });
});
