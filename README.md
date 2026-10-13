# Dynatrace OpenFeature Providers for JavaScript

Monorepo for the official [Dynatrace](https://dynatrace.com) [OpenFeature](https://openfeature.dev) providers for JavaScript.

> **Status:** Early alpha — not yet ready for production use.

## Packages

| Package                                                   | Description                        |
| --------------------------------------------------------- | ---------------------------------- |
| [`@dynatrace/openfeature-provider-web`](./packages/web)   | Provider for web browsers          |
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

### Running the e2e tests

The node provider runs the shared Gherkin suite from the [`fm-provider-test-harness`](https://github.com/Dynatrace/fm-provider-test-harness) submodule against its mock server via Testcontainers, so Docker must be running.

```bash
npm run test:e2e
```

The script initializes the submodule. Set `SKIP_HARNESS_UPDATE=1` to keep a local harness checkout, and `MOCKSERVER_IMAGE` to run against a locally built mock server image.

## License

Apache 2.0 — see [LICENSE](./LICENSE).
