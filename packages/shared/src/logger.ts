import { DefaultLogger, SafeLogger } from '@openfeature/core';
import type { Logger } from '@openfeature/core';

/**
 * Tag prepended to every log line so provider output is attributable in a shared console.
 *
 * The sibling providers get this from their logging framework's named loggers (slf4j
 * `LoggerFactory.getLogger(Class)`, Go `slog`, Python `logging.getLogger(__name__)`).
 * The JS ecosystem has no ambient logger, so we prefix explicitly.
 */
export const LOG_PREFIX = '[dynatrace-provider]';

/** Stands in for the SDK key wherever one would otherwise reach a log sink. */
export const REDACTED = '<redacted>';

/**
 * Wraps a caller-supplied logger, falling back to the OpenFeature default.
 *
 * The default emits `error` and `warn` to the console and drops `info` and `debug`, which
 * matches the siblings: their debug output is off until the host application turns it on.
 * Pass a logger to capture those levels.
 *
 * `SafeLogger` guards against a malformed logger (a missing or non-function level) by
 * falling back rather than throwing from a log call.
 *
 * Pass the SDK key as `secret` to strip it from every message. The key's private segment is
 * a credential, and it is embedded in the CDN URL that error messages from the network stack
 * can carry, so the scrub runs at the boundary rather than at each call site.
 */
export function resolveLogger(logger?: Logger, secret?: string): Logger {
  return withPrefix(new SafeLogger(logger ?? new DefaultLogger()), secret);
}

function withPrefix(logger: Logger, secret?: string): Logger {
  const scrub =
    secret == null || secret === ''
      ? (args: unknown[]) => args
      : (args: unknown[]) => args.map((arg) => (typeof arg === 'string' ? arg.split(secret).join(REDACTED) : arg));

  return {
    error: (...args: unknown[]) => logger.error(LOG_PREFIX, ...scrub(args)),
    warn: (...args: unknown[]) => logger.warn(LOG_PREFIX, ...scrub(args)),
    info: (...args: unknown[]) => logger.info(LOG_PREFIX, ...scrub(args)),
    debug: (...args: unknown[]) => logger.debug(LOG_PREFIX, ...scrub(args)),
  };
}
