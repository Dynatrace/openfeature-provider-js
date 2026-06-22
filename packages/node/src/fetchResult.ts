/** Outcome of a single CDN fetch attempt. */
export interface FetchResult {
  status: number;
  body: string | null;
  etag: string | null;
  lastModified: string | null;
}

export function isNotModified(result: FetchResult): boolean {
  return result.status === 304;
}

export function isRateLimited(result: FetchResult): boolean {
  return result.status === 429;
}

export function isSuccess(result: FetchResult): boolean {
  return result.status >= 200 && result.status < 300;
}
