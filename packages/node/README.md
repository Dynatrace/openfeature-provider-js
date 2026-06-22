# @dynatrace/openfeature-provider-node

Dynatrace [OpenFeature](https://openfeature.dev/) provider for Node.js (server-side).

Performs in-process flag evaluation against fm-service CDN-published config via `@openfeature/flagd-core`.

## Install

```bash
npm install @dynatrace/openfeature-provider-node @openfeature/server-sdk
```

## Usage

```ts
import { OpenFeature } from '@openfeature/server-sdk';
import { DynatraceProvider } from '@dynatrace/openfeature-provider-node';

const provider = new DynatraceProvider(process.env.DT_SDK_KEY!);
await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();
const enabled = await client.getBooleanValue('my-flag', false);
```

## License

Apache-2.0
