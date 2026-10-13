import { readFileSync } from 'node:fs';
import { ErrorCode, OpenFeature, type Client } from '@openfeature/server-sdk';
import { After, AfterAll, Before, Given, Then, When, setDefaultTimeout } from '@cucumber/cucumber';
import { expect } from 'vitest';
import { DynatraceProvider } from '../src/DynatraceProvider.js';
import { REQUEST_TIMEOUT_MS as PROVIDER_REQUEST_TIMEOUT_MS } from '../src/cdnFetcher.js';
import { DEFAULT_POLL_INTERVAL_MS } from '../src/pollingManager.js';
import { HARNESS_DIR, HTTP_OK, MockServer, type CdnResponse, type RecordedRequest } from './mockServer.js';

/** well-formed server SDK key the READY arrangement uses */
const BASE_KEY = 'dt01.server_us_abcdef1234.de848e97a9cc4cc78aae568e65f49a9d_a1b2c3d4e5';
/** flag configuration fixtures from the test harness submodule */
const FLAGS_DIR = new URL('flags/', HARNESS_DIR);

/** read from the provider, so scenarios assert against the real cadence */
const POLL_INTERVAL_MS = DEFAULT_POLL_INTERVAL_MS;
/** bound on one CDN attempt, read from the provider */
const REQUEST_TIMEOUT_MS = PROVIDER_REQUEST_TIMEOUT_MS;
/** longer than the poll cadence, so a refresh is observed */
const POLL_TIMEOUT_MS = POLL_INTERVAL_MS + 1_000;
/** covers the time taken by all retries for 5xx codes */
const RETRY_TIMEOUT_MS = 2_000;
/** window over which a "continues to" assertion must keep holding */
const STABLE_WINDOW_MS = 2_000;
/** state rides OpenFeature events, so allow it a moment to arrive */
const STATE_TIMEOUT_MS = 2_000;
/** slack when sleeping to a tick boundary, so the tick has fired by the time we look */
const TICK_MARGIN_MS = 500;
/** a fetch is at most two bounded attempts */
const COUNT_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 3;
/** how long an exact request count must keep holding, so a stray extra request still fails */
const COUNT_SETTLE_MS = 1_000;
/** wide enough for CI jitter, narrow enough that a wrongly anchored cadence fails */
const CADENCE_TOLERANCE_MS = 1_500;
/** a retry follows one request timeout later, well inside half a poll interval */
const SAME_TICK_GAP_MS = POLL_INTERVAL_MS / 2;
/** first poll tick is due one interval after init, plus a fetch's worth of slack */
const FIRST_TICK_TIMEOUT_MS = POLL_INTERVAL_MS + COUNT_TIMEOUT_MS;
/** outlives a whole fetch (two attempts, each abandoned at the timeout), so it spans a tick */
const SLOW_RESPONSE_DELAY_MS = REQUEST_TIMEOUT_MS * 4;
/** takes real time without timing out, so fetch start and end are far enough apart to tell apart */
const SLOW_BUT_WITHIN_TIMEOUT_DELAY_MS = REQUEST_TIMEOUT_MS - 1_000;
/** cadence assertions compare gaps, so they need at least two ticks */
const MIN_TICKS_TO_COMPARE = 2;
/** how often waitFor re-checks its condition */
const WAIT_POLL_STEP_MS = 100;
/** how often assertHoldsFor re-checks its condition */
const HOLD_CHECK_STEP_MS = 50;
/** converts the gherkin's seconds to millis */
const MS_PER_SECOND = 1_000;
/** poll-cadence steps sleep through several real poll intervals */
const STEP_TIMEOUT_MS = 120_000;

setDefaultTimeout(STEP_TIMEOUT_MS);

let scenarioSeq = 0;

// step definitions for the shared CDN gherkin spec (fm-provider-test-harness/gherkin/cdn.feature)
let domain: string;
let client: Client;
let sdkKey: string;
let mockServer: MockServer;
let initError: unknown;
/** baseline for "further request" counts, reset by arrangement and every clock-advancing step */
let countBaseline: number;
/** when initialization returned; the anchor every tick boundary is derived from */
let pollingStartedAtMs: number;
/** CDN responses currently set on the mock, so a delay can be layered onto them */
let cdnResponses: CdnResponse[];
let retryAfterMs: number;

Before(async () => {
  // unique domain so providers never leak across scenarios
  domain = `e2e-test-${++scenarioSeq}`;
  client = OpenFeature.getClient(domain);
  mockServer = await MockServer.get();
  await mockServer.reset();
  initError = undefined;
  countBaseline = 0;
  cdnResponses = [];
  retryAfterMs = 0;
});

After(async () => {
  await OpenFeature.close().catch(() => undefined);
});

// GIVEN

Given('a mock server is running', () => undefined);

Given(/^the SDK key "([^"]*)"$/, (key: string) => {
  sdkKey = key;
});

Given(/^the CDN serves the "([^"]*)" flag configuration$/, async (name: string) => {
  await setCdnResponses([{ status: HTTP_OK, body: loadFlagConfig(name) }]);
});

Given(
  /^an initialized, READY provider serving the "([^"]*)" flag configuration(?: with "([^"]*)" header "([^"]*)")?$/,
  async (name: string, header?: string, value?: string) => {
    sdkKey = BASE_KEY;
    await setCdnResponses([
      { status: HTTP_OK, body: loadFlagConfig(name), headers: header ? { [header]: value ?? '' } : undefined },
    ]);
    await registerProviderWithSdk();
    expect(client.providerStatus).toBe('READY');
    // end of arrangement: counts and tick boundaries run from here
    pollingStartedAtMs = Date.now();
    await resetCountBaseline();
  },
);

Given('the CDN responds slower than the request timeout', async () => {
  await delayCdnResponses(SLOW_RESPONSE_DELAY_MS);
});

Given('the CDN responds slowly but within the request timeout', async () => {
  await delayCdnResponses(SLOW_BUT_WITHIN_TIMEOUT_DELAY_MS);
});

// WHEN

When('the provider is initialized', async () => {
  try {
    await registerProviderWithSdk();
  } catch (err) {
    initError = err ?? new Error('initialization failed');
  }
  // anchor, not baseline: requests made by initialization count toward the scenario
  pollingStartedAtMs = Date.now();
});

When(/^the CDN responds with status (\d+)$/, async (status: number) => {
  await setCdnResponses([{ status }]);
});

// unquoted null means no body
When(/^the CDN responds with status (\d+) and body ("[^"]*"|null)$/, async (status: number, body: string) => {
  await setCdnResponses([{ status, body: body === 'null' ? undefined : body.slice(1, -1) }]);
});

When(
  /^the CDN responds with status (\d+) and the "([^"]*)" flag configuration with "([^"]*)" header "([^"]*)"$/,
  async (status: number, name: string, header: string, value: string) => {
    await setCdnResponses([{ status, body: loadFlagConfig(name), headers: { [header]: value } }]);
  },
);

When(
  /^the CDN responds (\d+) then (\d+) with the "([^"]*)" configuration$/,
  async (first: number, second: number, name: string) => {
    await setCdnResponses([{ status: first }, { status: second, body: loadFlagConfig(name) }]);
  },
);

When(/^the CDN responds with status (\d+) and Retry-After (\d+) seconds$/, async (status: number, seconds: number) => {
  retryAfterMs = seconds * MS_PER_SECOND;
  await setCdnResponses([{ status, headers: { 'Retry-After': String(seconds) } }]);
});

When('polling triggers a configuration refetch', async () => {
  const baseline = await mockServer.countCdnRequests();
  await waitFor(POLL_TIMEOUT_MS, async () => (await mockServer.countCdnRequests()) > baseline);
});

// baseline is taken before sleeping, so the next assertion counts what these intervals produced
When(/^(\d+) poll intervals? elapses?$/, async (intervals: number) => {
  await resetCountBaseline();
  await sleepUntil(computeNextTickAtMs() + (intervals - 1) * POLL_INTERVAL_MS + TICK_MARGIN_MS);
});

// waits for the next cadence-anchored tick, since the Retry-After window expiring does not itself fetch
When('the next poll tick arrives', async () => {
  await resetCountBaseline();
  await sleepUntil(computeNextTickAtMs() + TICK_MARGIN_MS);
});

When('the Retry-After window expires', async () => {
  await resetCountBaseline();
  await sleep(retryAfterMs + TICK_MARGIN_MS);
});

// THEN

Then('initialization succeeds', () => {
  expect(initError, `expected init to succeed but got: ${String(initError)}`).toBeUndefined();
});

Then('initialization fails', () => {
  expect(initError, 'expected initialization to fail').toBeDefined();
});

Then(/^the provider state is "([^"]*)"$/, async (state: string) => {
  await waitFor(STATE_TIMEOUT_MS, () => client.providerStatus === state);
  expect(client.providerStatus).toBe(state);
});

Then(/^the initial CDN request has no "([^"]*)" header$/, async (header: string) => {
  const request = await getNthCdnRequest(0);
  expect(request.hasHeader(header), `initial request unexpectedly carried header: ${header}`).toBe(false);
});

Then(
  /^the (\d+)\. CDN request has the "([^"]*)" header "([^"]*)"$/,
  async (index: number, header: string, value: string) => {
    const request = await getNthCdnRequest(index - 1);
    expect(request.hasHeader(header), `${index}. CDN request missing expected header: ${header}`).toBe(true);
    expect(request.getHeader(header), `${index}. CDN request ${header} header mismatch`).toBe(value);
  },
);

// must settle rather than merely be reached: these are upper bounds, which only hold if they keep holding
Then(/^the CDN has received (\d+) further requests?$/, async (count: number) => {
  if (count > 0) {
    await waitFor(COUNT_TIMEOUT_MS, async () => (await countFurtherRequests()) >= count);
  }
  await assertHoldsFor(
    COUNT_SETTLE_MS,
    async () => (await countFurtherRequests()) === count,
    async () => `expected ${count} further CDN request(s), saw ${await countFurtherRequests()}`,
  );
  await resetCountBaseline();
});

// cadence is anchored to when each fetch was issued, not when it finished
Then('consecutive poll ticks are one poll interval apart', async () => {
  // first request of each tick; requests closer than half an interval are attempts of one tick
  const ticks: number[] = [];
  let previous: number | undefined;
  for (const r of await mockServer.fetchCdnRequests()) {
    if (previous === undefined || r.receivedAtMs - previous >= SAME_TICK_GAP_MS) {
      ticks.push(r.receivedAtMs);
    }
    previous = r.receivedAtMs;
  }
  expect(
    ticks.length,
    `need at least ${MIN_TICKS_TO_COMPARE} poll ticks to compare, saw ${ticks.length}`,
  ).toBeGreaterThanOrEqual(MIN_TICKS_TO_COMPARE);
  for (let i = 1; i < ticks.length; i++) {
    assertCadence(ticks[i] - ticks[i - 1], `gap between poll tick ${i} and ${i + 1}`);
  }
});

// the polling timer starts once initialization has finished, not when it began
Then('the first poll tick is one poll interval after initialization completed', async () => {
  const anchor = pollingStartedAtMs;
  /** Finds when the first CDN request after initialization completed arrived, if any has. */
  const findFirstRequestAfterAnchor = async () =>
    (await mockServer.fetchCdnRequests()).find((r) => r.receivedAtMs > anchor)?.receivedAtMs;
  await waitFor(FIRST_TICK_TIMEOUT_MS, async () => (await findFirstRequestAfterAnchor()) !== undefined);
  const firstTick = await findFirstRequestAfterAnchor();
  expect(firstTick, 'no poll tick observed after initialization completed').toBeDefined();
  assertCadence(firstTick! - anchor, 'gap between initialization completing and the first poll tick');
});

Then(/^flag "([^"]*)" evaluates to (\w+)$/, async (flag: string, expected: string) => {
  expect(await isFlagValue(flag, expected === 'true'), `flag ${flag} did not evaluate to ${expected}`).toBe(true);
});

Then(/^flag "([^"]*)" eventually evaluates to (\w+)$/, async (flag: string, expected: string) => {
  await waitFor(RETRY_TIMEOUT_MS, () => isFlagValue(flag, expected === 'true'));
});

Then(/^flag "([^"]*)" continues to evaluate to (\w+)$/, async (flag: string, expected: string) => {
  const want = expected === 'true';
  expect(await isFlagValue(flag, want), `flag ${flag} did not evaluate to ${expected}`).toBe(true);
  await assertHoldsFor(
    STABLE_WINDOW_MS,
    () => isFlagValue(flag, want),
    () => `flag ${flag} changed away from ${expected}`,
  );
});

Then(/^evaluating flag "([^"]*)" returns a Flag-Not-Found error$/, async (flag: string) => {
  const details = await client.getBooleanDetails(flag, false);
  expect(details.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
});

/** Sets the CDN responses on the mock and remembers them, so a later step can delay them. */
async function setCdnResponses(responses: CdnResponse[]): Promise<void> {
  cdnResponses = responses;
  await mockServer.setCdnResponses(cdnResponses);
}

/** Re-sets the current CDN responses with every one held back by delayMs. */
async function delayCdnResponses(delayMs: number): Promise<void> {
  expect(cdnResponses, 'no CDN response set to delay').not.toHaveLength(0);
  cdnResponses = cdnResponses.map((r) => ({ ...r, delayMs }));
  await mockServer.setCdnResponses(cdnResponses);
}

/** Builds a fresh provider for the current SDK key and binds it to this scenario's domain, waiting for init. */
async function registerProviderWithSdk(): Promise<void> {
  const provider = new DynatraceProvider(sdkKey, {
    configOrigin: mockServer.origin,
    metricsOrigin: mockServer.origin,
  });
  await OpenFeature.setProviderAndWait(domain, provider);
}

/** Moves the baseline for "further request" counts to now. */
async function resetCountBaseline(): Promise<void> {
  countBaseline = await mockServer.countCdnRequests();
}

/** Counts CDN requests since the baseline. */
async function countFurtherRequests(): Promise<number> {
  return (await mockServer.countCdnRequests()) - countBaseline;
}

/** Computes the next tick boundary on the cadence anchored at pollingStartedAtMs. */
function computeNextTickAtMs(): number {
  const elapsed = Date.now() - pollingStartedAtMs;
  return pollingStartedAtMs + (Math.floor(elapsed / POLL_INTERVAL_MS) + 1) * POLL_INTERVAL_MS;
}

/** Gets the 0-indexed recorded CDN request, asserting at least that many arrived. */
async function getNthCdnRequest(index: number): Promise<RecordedRequest> {
  const requests = await mockServer.fetchCdnRequests();
  expect(requests.length, `expected at least ${index + 1} CDN request(s)`).toBeGreaterThan(index);
  return requests[index];
}

/** Checks a boolean flag through the client; defaults to the opposite so a missing flag never matches. */
async function isFlagValue(flag: string, want: boolean): Promise<boolean> {
  return (await client.getBooleanValue(flag, !want)) === want;
}
AfterAll(() => MockServer.stop());

/** Asserts a measured gap is one poll interval, within the cadence tolerance. */
function assertCadence(measuredMs: number, what: string): void {
  expect(
    Math.abs(measuredMs - POLL_INTERVAL_MS),
    `${what} was ${measuredMs}ms, expected ${POLL_INTERVAL_MS}ms +/- ${CADENCE_TOLERANCE_MS}ms`,
  ).toBeLessThanOrEqual(CADENCE_TOLERANCE_MS);
}

/** Loads a flag configuration fixture from the harness by file name, extension omitted. */
function loadFlagConfig(name: string): string {
  return readFileSync(new URL(`${name}.json`, FLAGS_DIR), 'utf8');
}

type Condition = () => boolean | Promise<boolean>;

/** Polls condition until it holds, failing if it still doesn't after timeoutMs. */
async function waitFor(timeoutMs: number, condition: Condition): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await sleep(WAIT_POLL_STEP_MS);
  }
  expect(await condition(), `condition not met within ${timeoutMs / MS_PER_SECOND}s`).toBe(true);
}

/** Asserts condition keeps holding for the whole of durationMs, failing with message the first time it doesn't. */
async function assertHoldsFor(
  durationMs: number,
  condition: Condition,
  message: () => string | Promise<string>,
): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    if (!(await condition())) {
      expect.fail(await message());
    }
    await sleep(HOLD_CHECK_STEP_MS);
  }
  if (!(await condition())) {
    expect.fail(await message());
  }
}

/** Sleeps until the given epoch millis; returns immediately if that has passed. */
async function sleepUntil(epochMs: number): Promise<void> {
  await sleep(epochMs - Date.now());
}

/** Sleeps for ms, treating a negative duration as zero. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
