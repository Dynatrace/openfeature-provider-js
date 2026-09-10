# Dynatrace OpenFeature Providers for JavaScript

Monorepo for the official [Dynatrace](https://dynatrace.com) [OpenFeature](https://openfeature.dev) providers for JavaScript.

> **Status:** Early alpha — not yet ready for production use.

## Packages

| Package | Description |
| --- | --- |
| [`@dynatrace/openfeature-provider-web`](./packages/web) | Provider for web browsers |
| [`@dynatrace/openfeature-provider-node`](./packages/node) | Provider for Node.js (server-side) |

See each package's README for installation, usage, and configuration.

`packages/shared` (SDK-key helpers and evaluation metrics core) is internal and bundled into the published providers.

## Development

Shared build tooling (esbuild, TypeScript, rollup-plugin-dts, vitest) is hoisted to the repository root.

```bash
npm ci
npm run build
npm test
npm run format
```

## License

Apache 2.0 — see [LICENSE](./LICENSE).
