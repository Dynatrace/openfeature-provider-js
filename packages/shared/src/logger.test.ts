import { describe, expect, it, vi } from 'vitest';
import { LOG_PREFIX, resolveLogger } from './logger';
import { publicKey } from './sdkKey';
import { VALID_SERVER_KEY } from './testKeys';

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

  it('reduces the SDK key to its public segment and leaves other arguments alone', () => {
    const inner = spyLogger();
    const logger = resolveLogger(inner, VALID_SERVER_KEY);
    const payload = { count: 1 };

    logger.info(`polling https://cdn.us.fm.dynatrace.com/server/${VALID_SERVER_KEY}.json`);
    logger.warn(`poll failed for ${VALID_SERVER_KEY}`, payload);

    const pub = publicKey(VALID_SERVER_KEY);
    expect(pub).not.toContain('secret');
    expect(inner.info).toHaveBeenCalledWith(LOG_PREFIX, `polling https://cdn.us.fm.dynatrace.com/server/${pub}.json`);
    expect(inner.warn).toHaveBeenCalledWith(LOG_PREFIX, `poll failed for ${pub}`, payload);
  });
});
