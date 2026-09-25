import { describe, it, expect, vi } from 'vitest';
import { SseManager, maskSseUrl, type SseEventSource } from './sseManager';

const URL_WITH_KEY = 'https://sse.us.fm.dynatrace.com/event-stream?v=1.2&key=SECRET&channels=dt01.server_us_x';

class FakeEventSource implements SseEventSource {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { code?: number; message?: string }) => void) | null = null;
  closed = false;

  close(): void {
    this.closed = true;
  }
}

function setup(url = URL_WITH_KEY) {
  const source = new FakeEventSource();
  const callbacks = {
    onConnected: vi.fn(),
    onDisconnected: vi.fn(),
    onMessage: vi.fn(),
  };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  const factory = vi.fn(() => source as SseEventSource);
  const manager = new SseManager(url, callbacks, factory, logger);
  return { manager, source, callbacks, logger, factory };
}

describe('maskSseUrl', () => {
  it('redacts the query string, which carries the channel key', () => {
    expect(maskSseUrl(URL_WITH_KEY)).toBe('https://sse.us.fm.dynatrace.com/event-stream?<redacted>');
  });

  it('leaves a URL without a query string alone', () => {
    expect(maskSseUrl('https://sse.example/stream')).toBe('https://sse.example/stream');
  });
});

describe('SseManager', () => {
  it('opens the stream at the given URL and reports a connect', () => {
    const { manager, source, callbacks, factory } = setup();

    manager.start();
    expect(factory).toHaveBeenCalledWith(URL_WITH_KEY);

    source.onopen?.({});
    expect(callbacks.onConnected).toHaveBeenCalledOnce();
  });

  it('parses a message and hands the envelope to the provider', () => {
    const { manager, source, callbacks } = setup();
    manager.start();

    source.onmessage?.({ data: '{"type":"refetchConfig","lastModified":1771622898}' });

    expect(callbacks.onMessage).toHaveBeenCalledWith({
      type: 'refetchConfig',
      etag: undefined,
      lastModified: 1771622898,
    });
  });

  it('drops an unparseable message without reporting a disconnect', () => {
    const { manager, source, callbacks } = setup();
    manager.start();

    source.onmessage?.({ data: 'not json' });

    expect(callbacks.onMessage).not.toHaveBeenCalled();
    expect(callbacks.onDisconnected).not.toHaveBeenCalled();
  });

  it('reports an error as a disconnect and never logs the key', () => {
    const { manager, source, callbacks, logger } = setup();
    manager.start();

    source.onerror?.({ code: 401, message: 'unauthorized' });

    expect(callbacks.onDisconnected).toHaveBeenCalledOnce();
    const logged = logger.warn.mock.calls.flat().join(' ');
    expect(logged).toContain('status 401');
    expect(logged).not.toContain('SECRET');
  });

  it('closes the source and detaches handlers on stop', () => {
    const { manager, source, callbacks } = setup();
    manager.start();

    manager.stop();

    expect(source.closed).toBe(true);
    expect(source.onopen).toBeNull();
    expect(source.onmessage).toBeNull();
    expect(source.onerror).toBeNull();
    expect(callbacks.onDisconnected).not.toHaveBeenCalled();
  });

  it('does not reopen after stop', () => {
    const { manager, factory } = setup();
    manager.start();
    manager.stop();

    manager.start();

    expect(factory).toHaveBeenCalledOnce();
  });

  it('is idempotent on repeated start and stop', () => {
    const { manager, factory } = setup();
    manager.start();
    manager.start();
    manager.stop();
    manager.stop();

    expect(factory).toHaveBeenCalledOnce();
  });
});
