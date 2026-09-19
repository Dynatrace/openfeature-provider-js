/** Outcome of a single CDN fetch attempt. */
export interface FetchResult {
  status: number;
  body: string | null;
  etag: string | null;
  lastModified: string | null;
  /**
   * True when no request was made because another fetch was already in flight.
   *
   * Distinct from a 304: a 304 means the CDN confirmed our cached config is current,
   * whereas a skipped result carries no information at all. Callers must not treat it
   * as a successful poll — doing so would reset the staleness grace timer for a request
   * that never happened.
   */
  skipped: boolean;
}

export function isSkipped(result: FetchResult): boolean {
  return result.skipped;
}

export function isNotModified(result: FetchResult): boolean {
  return !result.skipped && result.status === 304;
}

export function isRateLimited(result: FetchResult): boolean {
  return !result.skipped && result.status === 429;
}

export function isSuccess(result: FetchResult): boolean {
  return !result.skipped && result.status >= 200 && result.status < 300;
}
