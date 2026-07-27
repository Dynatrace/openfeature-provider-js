import { describe, it, expect } from 'vitest';
import { parseAblySseEvent } from './ablySseEventParser';

// Mirrors a real Ably SSE frame: an outer envelope whose nested `data` holds
// the Ably message, whose own `data` field is the OFREP payload JSON string.
const RAW_ABLY_FRAME = {
  id: 'S!01785167329117-000@e7dFffJYwC4xnJ62536038^UbpHtA',
  event: 'message',
  data: {
    data: '{"key":true}',
  },
};

function messageEvent(data: unknown): MessageEvent {
  return { data } as MessageEvent;
}

describe('parseAblySseEvent', () => {
  it('unwraps the double-nested Ably data when the frame is a JSON string', () => {
    const event = messageEvent(JSON.stringify(RAW_ABLY_FRAME));

    expect(parseAblySseEvent(event)).toEqual({ key: true });
  });

  it('unwraps the double-nested Ably data when the frame is an object', () => {
    const event = messageEvent(RAW_ABLY_FRAME);

    expect(parseAblySseEvent(event)).toEqual({ key: true });
  });

  it('parses a realistic refetchEvaluation payload', () => {
    const payload = {
      type: 'refetchEvaluation',
      etag: 'W/"abc123"',
      lastModified: 1785167329090,
    };
    const frame = {
      ...RAW_ABLY_FRAME,
      data: { ...RAW_ABLY_FRAME.data, data: JSON.stringify(payload) },
    };

    expect(parseAblySseEvent(messageEvent(JSON.stringify(frame)))).toEqual(payload);
  });

  it('returns the nested payload as-is when it is already an object', () => {
    const payload = { type: 'refetchEvaluation', etag: 'v2' };
    const frame = {
      ...RAW_ABLY_FRAME,
      data: { ...RAW_ABLY_FRAME.data, data: payload },
    };

    expect(parseAblySseEvent(messageEvent(frame))).toEqual(payload);
  });

  // Forward compatibility: if the Ably double-nesting is ever absent, the
  // parser must not throw. It falls back to defaultSseEventParser so an
  // unrecognized shape is handled gracefully rather than crashing.
  it('falls back to the default parser when the nested data payload is missing (object frame)', () => {
    const frame = { id: 'x', event: 'message', data: { name: 'eventName' } };

    // Object frames are returned as-is by defaultSseEventParser.
    expect(parseAblySseEvent(messageEvent(frame))).toEqual(frame);
  });

  it('falls back to the default parser for an un-nested OFREP message (string frame)', () => {
    const payload = { type: 'refetchEvaluation', etag: 'z' };

    expect(parseAblySseEvent(messageEvent(JSON.stringify(payload)))).toEqual(payload);
  });

  it('throws on a malformed JSON frame', () => {
    expect(() => parseAblySseEvent(messageEvent('not json'))).toThrow();
  });
});
