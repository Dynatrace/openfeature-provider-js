import { DefaultLogger, SafeLogger } from '@openfeature/core';
import type { Logger } from '@openfeature/core';
import { publicKey } from './sdkKey';

/** Tag prepended to every log line; the JS ecosystem has no ambient named logger. */
export const LOG_PREFIX = '[dynatrace-provider]';

/**
 * Wraps a caller-supplied logger, falling back to the OpenFeature default, which drops
 * `info` and `debug` until the host opts in.
 *
 * Passing `sdkKey` reduces it to its public segment in every message: the private segment
 * is a credential, and it rides along in the CDN URL that network errors can carry.
 */
export function resolveLogger(logger?: Logger, sdkKey?: string): Logger {
  return withPrefix(new SafeLogger(logger ?? new DefaultLogger()), sdkKey);
}

function withPrefix(logger: Logger, sdkKey?: string): Logger {
  const scrub =
    sdkKey == null || sdkKey === ''
      ? (args: unknown[]) => args
      : (() => {
          const replacement = publicKey(sdkKey);
          return (args: unknown[]) =>
            args.map((arg) => (typeof arg === 'string' ? arg.split(sdkKey).join(replacement) : arg));
        })();

  return {
    error: (...args: unknown[]) => logger.error(LOG_PREFIX, ...scrub(args)),
    warn: (...args: unknown[]) => logger.warn(LOG_PREFIX, ...scrub(args)),
    info: (...args: unknown[]) => logger.info(LOG_PREFIX, ...scrub(args)),
    debug: (...args: unknown[]) => logger.debug(LOG_PREFIX, ...scrub(args)),
  };
}
