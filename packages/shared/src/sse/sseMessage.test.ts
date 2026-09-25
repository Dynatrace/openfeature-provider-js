import { describe, it, expect } from 'vitest';
import { parseSseMessage, unwrapSseData, SSE_TYPE_REFETCH_CONFIG } from './sseMessage';

function ablyFrame(inner: unknown): string {
  return JSON.stringify({
    id: 'abc:0',
    channel: 'dt01.server_us_x',
    name: SSE_TYPE_REFETCH_CONFIG,
    data: JSON.stringify(inner),
  });
}

describe('unwrapSseData', () => {
  it('returns the inner payload of an Ably frame', () => {
    expect(unwrapSseData(ablyFrame({ type: SSE_TYPE_REFETCH_CONFIG }))).toBe('{"type":"refetchConfig"}');
  });

  it('returns null for a flat payload that is not a frame', () => {
    expect(unwrapSseData('{"type":"refetchConfig"}')).toBeNull();
  });

  it('returns null for an unparseable payload', () => {
    expect(unwrapSseData('not json')).toBeNull();
  });
});

describe('parseSseMessage', () => {
  it('parses a flat envelope', () => {
    const message = parseSseMessage('{"type":"refetchConfig","etag":"\\"abc\\"","lastModified":1771622898}');
    expect(message).toEqual({ type: 'refetchConfig', etag: '"abc"', lastModified: 1771622898 });
  });

  it('parses an Ably-wrapped envelope', () => {
    const message = parseSseMessage(ablyFrame({ type: SSE_TYPE_REFETCH_CONFIG, lastModified: 1771622898 }));
    expect(message).toEqual({ type: 'refetchConfig', etag: undefined, lastModified: 1771622898 });
  });

  it('keeps an unknown type so the caller can decide to ignore it', () => {
    expect(parseSseMessage('{"type":"somethingNew"}')?.type).toBe('somethingNew');
  });

  it('ignores metadata rather than forwarding it', () => {
    const message = parseSseMessage('{"type":"refetchConfig","metadata":{"secret":"x"}}');
    expect(message).not.toHaveProperty('metadata');
  });

  it.each([
    ['unparseable JSON', 'not json'],
    ['a JSON scalar', '42'],
    ['a missing type', '{"etag":"\\"abc\\""}'],
    ['a blank type', '{"type":"  "}'],
    ['a non-string type', '{"type":7}'],
  ])('returns null for %s', (_label, payload) => {
    expect(parseSseMessage(payload)).toBeNull();
  });

  it('drops a lastModified that is not a finite number', () => {
    expect(parseSseMessage('{"type":"refetchConfig","lastModified":"soon"}')?.lastModified).toBeUndefined();
  });
});
