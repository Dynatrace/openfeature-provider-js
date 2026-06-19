# @dynatrace/openfeature-provider-web

The official Dynatrace OpenFeature provider for web.

> **Questions, comments or suggestions?** Reach out to [cobi.druxerman@dynatrace.com](mailto:cobi.druxerman@dynatrace.com).

---

## Installation

```bash
npm install @dynatrace/openfeature-provider-web @openfeature/web-sdk
```

```bash
# yarn requires manual installation of the @openfeature/core peer-dependency
yarn add @dynatrace/openfeature-provider-web @openfeature/web-sdk @openfeature/core
```

---

## Configuration

The provider is constructed with the SDK key as the first argument and optional
overrides as the second:

```ts
new DynatraceProvider(sdkKey, options?);
```

| Option            | Type     | Default          | Description                                                                                                                                                                  |
| ----------------- | -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiOrigin`       | `string` | derived from key | Override the OFREP API origin. When omitted, derived from the `geo` segment of the SDK key.                                                                                  |
| `metricsUrl`      | `string` | derived from key | Override the metrics ingest endpoint. When omitted, derived from the SDK key geo.                                                                                            |
| `pollInterval`    | `number` | `-1` (disabled)  | How often (ms) the provider polls for updated flags. Set to `-1` or omit to rely solely on context-change refetches. The minimum polling interval that can be set is 1000ms. |
| `flushIntervalMs` | `number` | `30_000`         | How often accumulated evaluation metrics are flushed. Values between 0 and 999 are clamped to 1000ms. Pass a negative number to disable periodic flushing.                   |
| `maxCapacity`     | `number` | `5_000`          | Maximum number of distinct aggregate-map entries before a capacity flush is triggered.                                                                                       |

The SDK key (e.g. `dt01.web_us_…`) is required as the first constructor argument. The region segment determines the OFREP and metrics endpoints; the full key is sent as the `Authorization` header.

---

## Usage

### Basic setup

```ts
import { OpenFeature } from '@openfeature/web-sdk';
import { DynatraceProvider } from '@dynatrace/openfeature-provider-web';

const provider = new DynatraceProvider('dt01.web_us_…');

// Set evaluation context before registering the provider so the initial
// bulk evaluation includes targeting information.
await OpenFeature.setContext({ targetingKey: 'user-abc' });

// Wait until the provider has fetched all flags before evaluating.
await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();
const showBanner = client.getBooleanValue('show-banner', false);
```

### Context changes

Calling `OpenFeature.setContext()` after provider registration automatically
triggers a new bulk evaluation for the new context. Changed flag keys are
surfaced via the `PROVIDER_CONFIGURATION_CHANGED` event.

```ts
// Re-evaluates all flags for the new user context.
await OpenFeature.setContext({ targetingKey: 'user-xyz', plan: 'enterprise' });
```

### Periodic polling

Pass a `pollInterval` (in milliseconds) to have the provider re-fetch flags
on a timer in addition to context-change triggers.

```ts
const provider = new DynatraceProvider('dt01.web_us_…', {
  pollInterval: 60_000, // refresh every 60 seconds
});
```

### Listening for flag changes

```ts
import { OpenFeature, ProviderEvents } from '@openfeature/web-sdk';

OpenFeature.addHandler(ProviderEvents.ConfigurationChanged, (event) => {
  console.log('Flags changed:', event?.flagsChanged);
  // Re-render components that depend on changed flags.
});
```

## License

[Apache-2.0](../../LICENSE)
