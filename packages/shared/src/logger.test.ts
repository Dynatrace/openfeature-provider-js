import { describe, expect, it, vi } from 'vitest';
import { LOG_PREFIX, REDACTED, resolveLogger } from './logger';

function spyLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

describe('resolveLogger', () => {
  it('forwards every level to the supplied logger, prefixed', () => {
    const inner = spyLogger();
    const logger = resolveLogger(inner);

    logger.error('boom');
    logger.warn('careful');
    logger.info('fyi');
    logger.debug('detail');

    expect(inner.error).toHaveBeenCalledWith(LOG_PREFIX, 'boom');
    expect(inner.warn).toHaveBeenCalledWith(LOG_PREFIX, 'careful');
    expect(inner.info).toHaveBeenCalledWith(LOG_PREFIX, 'fyi');
    expect(inner.debug).toHaveBeenCalledWith(LOG_PREFIX, 'detail');
  });

  it('defaults to console for error and warn, and drops info and debug', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const logger = resolveLogger();
    logger.error('boom');
    logger.warn('careful');
    logger.info('fyi');
    logger.debug('detail');

    expect(error).toHaveBeenCalledWith(LOG_PREFIX, 'boom');
    expect(warn).toHaveBeenCalledWith(LOG_PREFIX, 'careful');
    // Matches the siblings: debug output stays off until the host enables it.
    expect(info).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('falls back to the default logger when a level is missing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = resolveLogger({ error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never);
    logger.error('boom');

    expect(error).toHaveBeenCalledWith(LOG_PREFIX, 'boom');
    vi.restoreAllMocks();
  });

  it('strips the secret from every level', () => {
    const inner = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const logger = resolveLogger(inner, 'dt01.server_us_abc123.secret_sha');

    logger.info('polling https://cdn.us.fm.dynatrace.com/server/dt01.server_us_abc123.secret_sha.json');
    logger.warn('poll failed for dt01.server_us_abc123.secret_sha');

    expect(inner.info).toHaveBeenCalledWith(
      LOG_PREFIX,
      `polling https://cdn.us.fm.dynatrace.com/server/${REDACTED}.json`,
    );
    expect(inner.warn).toHaveBeenCalledWith(LOG_PREFIX, `poll failed for ${REDACTED}`);
  });

  it('passes non-string arguments through untouched', () => {
    const inner = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const logger = resolveLogger(inner, 'a-secret');
    const payload = { count: 1 };

    logger.debug('context', payload);

    expect(inner.debug).toHaveBeenCalledWith(LOG_PREFIX, 'context', payload);
  });
});
