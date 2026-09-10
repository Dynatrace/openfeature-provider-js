# Dynatrace OpenFeature Provider for Node.js

The official [Dynatrace](https://dynatrace.com) [OpenFeature](https://openfeature.dev) provider for Node.js server-side applications.

The provider evaluates flags in-process: on initialization it fetches your flag configuration from the Dynatrace CDN and keeps it up to date in the background, so evaluations are local and do not make a network call.

> **Status:** Early alpha — not yet ready for production use.

## Installation

```bash
npm install @dynatrace/openfeature-provider-node @openfeature/server-sdk
```

## Usage

```ts
import { OpenFeature } from '@openfeature/server-sdk';
import { DynatraceProvider } from '@dynatrace/openfeature-provider-node';

await OpenFeature.setProviderAndWait(new DynatraceProvider(process.env.DT_SDK_KEY!));

const client = OpenFeature.getClient();
const enabled = await client.getBooleanValue('my-flag', false, { targetingKey: 'user-123' });

// On shutdown:
await OpenFeature.close();
```

Once the provider is registered, all flag evaluation goes through the OpenFeature API. See the
[OpenFeature JavaScript SDK documentation](https://openfeature.dev/docs/reference/technologies/server/javascript/)
for evaluation contexts, hooks, events, and the rest of the SDK surface.

## Configuration

The provider takes the SDK key as its first argument and optional overrides as the second:

```ts
const provider = new DynatraceProvider(sdkKey, {
  configOrigin: 'https://cdn.eu.fm.dynatracelabs.com',
  metricsOrigin: 'https://metrics.eu.fm.dynatracelabs.com',
});
```

| Option          | Type     | Default              | Description                                    |
| --------------- | -------- | -------------------- | ---------------------------------------------- |
| `configOrigin`  | `string` | derived from SDK key | Override the flag configuration origin.        |
| `metricsOrigin` | `string` | derived from SDK key | Override the evaluation metrics ingest origin. |

## License

Apache 2.0 — see [LICENSE](../../LICENSE).
