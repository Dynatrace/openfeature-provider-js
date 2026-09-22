/** Abort helpers shared by the fetch, retry, and polling layers. */

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}
