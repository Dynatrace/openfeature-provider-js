/**
 * Minimal server-side quickstart for the Dynatrace OpenFeature provider.
 *
 * Build the package first so the workspace import resolves to dist:
 *
 *   npm run build --workspace=packages/node
 *
 * Then run it:
 *
 *   DT_SDK_KEY=dt01.server_... \
 *   DT_CONFIG_ORIGIN=https://cdn.eu.fm.dynatracelabs.com \
 *   DT_TARGETING_KEY=my-user \
 *   DT_EMAIL=me@dynatrace.com \
 *   node packages/node/examples/quickstart.mjs
 */
import { DynatraceProvider } from '@dynatrace/openfeature-provider-node';
import { OpenFeature } from '@openfeature/server-sdk';

const sdkKey = process.env.DT_SDK_KEY;
if (!sdkKey) {
  console.error('DT_SDK_KEY is required');
  process.exit(1);
}

const options = {};
if (process.env.DT_CONFIG_ORIGIN) {
  options.configOrigin = process.env.DT_CONFIG_ORIGIN;
}
if (process.env.DT_METRICS_ORIGIN) {
  options.metricsOrigin = process.env.DT_METRICS_ORIGIN;
}
// The default logger prints warnings and errors only. Pass console to see the provider's
// info and debug output, which is how the siblings behave once the host enables debug.
if (process.env.DT_DEBUG) {
  options.logger = console;
}

await OpenFeature.setProviderAndWait(new DynatraceProvider(sdkKey, options));
console.log('provider: READY');

const client = OpenFeature.getClient('example');

async function evaluate(context) {
  const bool = await client.getBooleanDetails('boolean-flag', false, context);
  const string = await client.getStringDetails('string-flag', '', context);
  const number = await client.getNumberDetails('number-flag', 0, context);

  for (const [name, details] of [
    ['boolean-flag', bool],
    ['string-flag', string],
    ['number-flag', number],
  ]) {
    const variant = details.variant ?? '';
    console.log(
      `  ${name.padEnd(13)} = ${String(JSON.stringify(details.value)).padEnd(10)} variant="${variant}" reason=${details.reason}`,
    );
  }
}

console.log('\n--- without targeting context ---');
await evaluate({});

console.log(`\n--- with targetingKey=${process.env.DT_TARGETING_KEY ?? ''} email=${process.env.DT_EMAIL ?? ''} ---`);
await evaluate({
  targetingKey: process.env.DT_TARGETING_KEY ?? 'user-456',
  email: process.env.DT_EMAIL ?? 'test@external.com',
});

// Flushes any buffered evaluation metrics and stops polling.
await OpenFeature.close();
