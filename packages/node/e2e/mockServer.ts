import { readFileSync } from 'node:fs';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

/** mock server image repository; the tag comes from the harness version.txt */
const IMAGE_REPO = 'ghcr.io/dynatrace/fm-provider-mock-server';
/** port the mock server listens on inside the container */
const CONTAINER_PORT = 8080;
/** bound on pulling and starting the mock server container */
const CONTAINER_STARTUP_TIMEOUT_MS = 60_000;
/** bound on one control API call */
const CONTROL_REQUEST_TIMEOUT_MS = 10_000;
/** HTTP status the mock CDN serves a flag configuration with, and the health check answers with */
export const HTTP_OK = 200;

/** Test harness submodule at the repo root. */
export const HARNESS_DIR = new URL('../../../fm-provider-test-harness/', import.meta.url);

let container: Promise<StartedTestContainer> | undefined;

/** Client for the containerized mock CDN, metrics and SSE backend, scripted via its control API. */
export class MockServer {
  private constructor(readonly origin: string) {}

  /** Lazily starts the singleton container and returns a client bound to it. */
  static async get(): Promise<MockServer> {
    if (!container) {
      // pinned to the submodule's version.txt so the image never drifts from the spec; MOCKSERVER_IMAGE overrides
      const image =
        process.env.MOCKSERVER_IMAGE ||
        `${IMAGE_REPO}:v${readFileSync(new URL('version.txt', HARNESS_DIR), 'utf8').trim()}`;
      container = new GenericContainer(image)
        .withExposedPorts(CONTAINER_PORT)
        .withWaitStrategy(Wait.forHttp('/__control__/health', CONTAINER_PORT).forStatusCode(HTTP_OK))
        .withStartupTimeout(CONTAINER_STARTUP_TIMEOUT_MS)
        .start();
    }
    const c = await container;
    return new MockServer(`http://${c.getHost()}:${c.getMappedPort(CONTAINER_PORT)}`);
  }

  /** Clears CDN responses, recorded requests and rate-limit state. */
  async reset(): Promise<void> {
    await this.sendControlRequest('POST', '/__control__/reset');
  }

  /** Sets the CDN responses in order; each fetch consumes the next, and the last one repeats once exhausted. */
  async setCdnResponses(responses: CdnResponse[]): Promise<void> {
    const body = {
      responses: responses.map((r) => ({
        status: r.status,
        ...(r.body !== undefined && { body: r.body }),
        ...(r.delayMs && { delayMs: r.delayMs }),
        headers: r.headers ?? {},
      })),
      repeatLast: true,
    };
    await this.sendControlRequest('PUT', '/__control__/cdn/responses', JSON.stringify(body));
  }

  /** Fetches the CDN requests received since the last reset, in arrival order. */
  async fetchCdnRequests(): Promise<RecordedRequest[]> {
    const json = JSON.parse(await this.sendControlRequest('GET', '/__control__/cdn/requests')) as {
      requests: { method: string; path: string; headers: Record<string, string>; receivedAtMs: number }[];
    };
    return json.requests.map(
      (r) =>
        new RecordedRequest(
          r.method,
          r.path,
          Object.fromEntries(Object.entries(r.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])),
          r.receivedAtMs,
        ),
    );
  }

  /** Counts the CDN requests received since the last reset. */
  async countCdnRequests(): Promise<number> {
    return (await this.fetchCdnRequests()).length;
  }

  /** Sends one control API call and returns its body, failing on a non-2xx answer. */
  private async sendControlRequest(method: string, path: string, body?: string): Promise<string> {
    const res = await fetch(this.origin + path, {
      method,
      body,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(CONTROL_REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`control call ${method} ${path} failed: HTTP ${res.status} ${text}`);
    }
    return text;
  }

  /** Stops the singleton container, if one was started. */
  static async stop(): Promise<void> {
    const c = container;
    container = undefined;
    await (await c)?.stop();
  }
}

/** A single CDN response set on the mock. */
export interface CdnResponse {
  status: number;
  /** undefined means no body at all */
  body?: string;
  headers?: Record<string, string>;
  /** held back this long before answering; the request is still recorded at arrival */
  delayMs?: number;
}

/** A CDN request the mock recorded. */
export class RecordedRequest {
  constructor(
    readonly method: string,
    readonly path: string,
    /** lower-cased header names */
    readonly headers: Record<string, string>,
    /** epoch millis at arrival, stamped before any response delay */
    readonly receivedAtMs: number,
  ) {}

  /** Checks whether the request carried the header, case-insensitively. */
  hasHeader(name: string): boolean {
    return this.getHeader(name) !== undefined;
  }

  /** Gets the header's value, case-insensitively; undefined when absent. */
  getHeader(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }
}
