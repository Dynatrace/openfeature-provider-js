import { describe, it, expect } from 'vitest';
import { parseAblySseEvent } from './ablySseEventParser';

const OFREP_PAYLOAD = {
  type: 'refetchEvaluation',
  etag: '75cf69180d3293db1b0159552a3717b3',
  lastModified: 1785246614400,
};

const OFREP_PAYLOAD_STRING = JSON.stringify(OFREP_PAYLOAD);

// real Ably channel SSE frame; OFREP payload is JSON-stringified in frame.data
const RAW_ABLY_FRAME = {
  id: 'C-pn5DV3ix:0:0',
  timestamp: 1785246620349,
  name: 'refetchEvaluation',
  channel: 'dt01.web_us_7m5eaqtwks.26541359b212661389752fc11f672945baa7d49eaa226ba4541261d13e77b3bf',
  action: 0,
  serial: '01785246620349-000@6f8qluzewC54LH88841174:000',
  data: OFREP_PAYLOAD_STRING,
};

function messageEvent(data: unknown): MessageEvent {
  return { data } as MessageEvent;
}

describe('parseAblySseEvent', () => {
  it('unwraps the Ably channel SSE frame when the event data is a JSON string', () => {
    expect(parseAblySseEvent(messageEvent(JSON.stringify(RAW_ABLY_FRAME)))).toEqual(OFREP_PAYLOAD);
  });

  it('unwraps the Ably channel SSE frame when the event data is already an object', () => {
    expect(parseAblySseEvent(messageEvent(RAW_ABLY_FRAME))).toEqual(OFREP_PAYLOAD);
  });

  it('falls back to the default parser for an un-nested OFREP message (no Ably envelope)', () => {
    expect(parseAblySseEvent(messageEvent(OFREP_PAYLOAD_STRING))).toEqual(OFREP_PAYLOAD);
  });

  it('throws on a malformed JSON frame', () => {
    expect(() => parseAblySseEvent(messageEvent('not json'))).toThrow();
  });
});
