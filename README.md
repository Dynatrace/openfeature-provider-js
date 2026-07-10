# openfeature-provider-js

Monorepo for the official Dynatrace [OpenFeature](https://openfeature.dev/) providers for JavaScript.

Published packages live under `packages/`. Shared build tooling (esbuild, TypeScript, rollup-plugin-dts, vitest) is hoisted to the repository root.

## Development

```bash
npm ci
npm run build
npm test
npm run format
```

## Packages

| Package                                                   | Description                                              |
| --------------------------------------------------------- | -------------------------------------------------------- |
| [`@dynatrace/openfeature-provider-web`](./packages/web)   | Dynatrace OpenFeature provider for web browsers          |
| [`@dynatrace/openfeature-provider-node`](./packages/node) | Dynatrace OpenFeature provider for Node.js (server-side) |

Internal (not published): `packages/shared` (SDK-key helpers and evaluation metrics core, bundled into providers).

## License

Apache-2.0. See [LICENSE](./LICENSE).
