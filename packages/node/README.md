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

| Option          | Type      | Default              | Description                                                          |
| --------------- | --------- | -------------------- | -------------------------------------------------------------------- |
| `configOrigin`  | `string`  | derived from SDK key | Override the flag configuration origin.                              |
| `metricsOrigin` | `string`  | derived from SDK key | Override the evaluation metrics ingest origin.                       |
| `logger`        | `Logger`  | console (warn/error) | Receives provider diagnostics. The default drops `info` and `debug`. |
| `disableSse`    | `boolean` | `false`              | Opt out of streamed change notifications and rely on polling alone.  |

## Staying up to date

The provider keeps its configuration current two ways at once:

- **Change notifications.** It opens a Server-Sent Events connection to the stream your
  configuration advertises, and re-fetches as soon as a change is announced. The connection
  reconnects on its own, and the provider follows the stream URL if it is rotated.
- **Polling.** A conditional `GET` against the CDN runs every 10 seconds. While the notification
  stream is connected this relaxes to 10 minutes, since it is only a safety net; it tightens back
  to 10 seconds whenever the stream is down or disabled.

Neither interval is configurable. Set `disableSse: true` to skip the stream entirely; polling then
stays at its 10 second cadence, so changes still arrive, just less promptly.

The open connection keeps the Node event loop alive for as long as the provider is registered.
Closing it is part of a normal shutdown:

```ts
await OpenFeature.close();
```

## Examples

A runnable quickstart lives in [`examples/`](examples). See its
[README](examples/README.md) for the environment variables it accepts.

## License

Apache 2.0 — see [LICENSE](../../LICENSE).
