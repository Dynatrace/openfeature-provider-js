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

| Package             | Description                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| _Coming in Phase 2_ | `@dynatrace/openfeature-provider-web` will be migrated from [openfeature-provider-web](https://github.com/Dynatrace/openfeature-provider-web) |

## License

Apache-2.0. See [LICENSE](./LICENSE).
