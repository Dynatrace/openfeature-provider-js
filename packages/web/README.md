# Dynatrace OpenFeature Provider for Web

The official [Dynatrace](https://dynatrace.com) [OpenFeature](https://openfeature.dev) provider for web browsers.

The provider evaluates flags remotely: it fetches all flag values for the current evaluation context in a single bulk request, then serves evaluations from that cache and refetches when the context changes.

> **Status:** Early alpha — not yet ready for production use.

## Installation

```bash
npm install @dynatrace/openfeature-provider-web @openfeature/web-sdk
```

```bash
# yarn requires manual installation of the @openfeature/core peer dependency
yarn add @dynatrace/openfeature-provider-web @openfeature/web-sdk @openfeature/core
```

## Usage

```ts
import { OpenFeature } from '@openfeature/web-sdk';
import { DynatraceProvider } from '@dynatrace/openfeature-provider-web';

// Set the evaluation context before registering the provider so the initial
// bulk evaluation includes targeting information.
await OpenFeature.setContext({ targetingKey: 'user-123' });
await OpenFeature.setProviderAndWait(new DynatraceProvider('dt01.web_us_…'));

const client = OpenFeature.getClient();
const showBanner = client.getBooleanValue('show-banner', false);
```

Calling `OpenFeature.setContext()` after registration re-evaluates all flags for the new context and
surfaces changed flag keys via the `PROVIDER_CONFIGURATION_CHANGED` event.

Once the provider is registered, all flag evaluation goes through the OpenFeature API. See the
[OpenFeature Web SDK documentation](https://openfeature.dev/docs/reference/technologies/client/web/)
for evaluation contexts, hooks, events, and the rest of the SDK surface.

## Configuration

The provider takes the SDK key as its first argument and optional overrides as the second:

```ts
const provider = new DynatraceProvider(sdkKey, {
  pollInterval: 60_000,
});
```

| Option          | Type     | Default              | Description                                                                                                       |
| --------------- | -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pollInterval`  | `number` | `-1` (disabled)      | How often, in milliseconds, the provider refetches flags in addition to context-change refetches. Minimum 1000ms. |
| `apiOrigin`     | `string` | derived from SDK key | Override the flag evaluation API origin.                                                                          |
| `metricsOrigin` | `string` | derived from SDK key | Override the evaluation metrics ingest origin.                                                                    |

A runnable example lives in [`examples/react-app`](examples/react-app).

## License

Apache 2.0 — see [LICENSE](../../LICENSE).
