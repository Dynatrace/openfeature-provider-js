/** Path appended to a validated metrics origin to form the ingest URL. */
export const METRICS_INGEST_PATH = '/v1/metrics';

/**
 * Path (and only the path) after the authority in `value`.
 *
 * WHATWG `URL.pathname` resolves `..` and collapses some slash forms, so a
 * raw split is what makes `https://host/..` and `https://host//` reject the
 * same way as the RFC parsers in Java, Go, and Python.
 */
function pathAfterAuthority(value: string): string {
  const sep = value.indexOf('://');
  const rest = sep < 0 ? value : value.slice(sep + 3);
  let i = 0;
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0) {
      return rest;
    }
    i = close + 1;
    if (rest[i] === ':') {
      i += 1;
      while (i < rest.length && rest[i] >= '0' && rest[i] <= '9') {
        i += 1;
      }
    }
  } else {
    while (i < rest.length && rest[i] !== '/' && rest[i] !== '?' && rest[i] !== '#') {
      i += 1;
    }
  }
  let end = i;
  while (end < rest.length && rest[end] !== '?' && rest[end] !== '#') {
    end += 1;
  }
  return rest.slice(i, end);
}

function authorityOf(value: string): string {
  const sep = value.indexOf('://');
  const rest = sep < 0 ? value : value.slice(sep + 3);
  const q = rest.search(/[/?#]/);
  return q < 0 ? rest : rest.slice(0, q);
}

/**
 * Validate that `value` is a bare origin (scheme, host, optional port) and
 * return it in canonical form with no trailing slash.
 *
 * An origin is a scheme, host, and optional port; nothing else. Anything that
 * could not be safely appended to is rejected here, so a malformed override
 * fails at construction rather than as a 404 on the first request.
 *
 * Explicit default ports (`:443`, `:80`) are kept. WHATWG `url.origin` would
 * drop them.
 */
export function validateOrigin(value: string, field: string): string {
  const stripped = value.trim();
  let url: URL;
  try {
    url = new URL(stripped);
  } catch {
    throw new Error(`${field} is not a valid URI: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${field} must use http or https; got: "${value}"`);
  }
  if (!url.hostname) {
    throw new Error(`${field} must include a host; got: "${value}"`);
  }
  if (url.username || url.password) {
    throw new Error(`${field} must not include user info; got: "${value}"`);
  }
  const path = pathAfterAuthority(stripped);
  if (path && path !== '/') {
    throw new Error(`${field} must not include a path; got: "${value}"`);
  }
  if (url.search) {
    throw new Error(`${field} must not include a query string; got: "${value}"`);
  }
  if (url.hash) {
    throw new Error(`${field} must not include a fragment; got: "${value}"`);
  }
  const protocol = url.protocol === 'http:' ? 'http' : 'https';
  return `${protocol}://${authorityOf(stripped).toLowerCase()}`;
}

/**
 * Resolve a public `metricsOrigin` override to the full metrics ingest URL.
 */
export function metricsUrlFromOrigin(metricsOrigin: string | null): string {
  if (metricsOrigin == null || metricsOrigin.trim() === '') {
    throw new Error('metricsOrigin must not be null or blank');
  }
  return `${validateOrigin(metricsOrigin.trim(), 'metricsOrigin')}${METRICS_INGEST_PATH}`;
}
