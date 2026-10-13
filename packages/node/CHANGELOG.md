# Changelog

## [0.1.1-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-node-v0.1.0-alpha...openfeature-provider-node-v0.1.1-alpha) (2026-10-13)


### 🐛 Bug Fixes

* expose ./package.json in package exports ([#40](https://github.com/Dynatrace/openfeature-provider-js/issues/40)) ([afae7b9](https://github.com/Dynatrace/openfeature-provider-js/commit/afae7b923ebb8523e7089b6c231fc087cc8a5435))

## [0.1.0-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-node-v0.0.1-alpha...openfeature-provider-node-v0.1.0-alpha) (2026-09-25)


### ⚠ BREAKING CHANGES

* rename metricsUrl to metricsOrigin, accept origin-only value ([#28](https://github.com/Dynatrace/openfeature-provider-js/issues/28))

### ✨ New Features

* add a shared logger and route node provider diagnostics through it ([#34](https://github.com/Dynatrace/openfeature-provider-js/issues/34)) ([a11fe8c](https://github.com/Dynatrace/openfeature-provider-js/commit/a11fe8c7adce686745bc53c20b57153367fc98ca))
* add CDN fetcher and polling manager for node provider ([#14](https://github.com/Dynatrace/openfeature-provider-js/issues/14)) ([fa5889b](https://github.com/Dynatrace/openfeature-provider-js/commit/fa5889bb4598205e6aa406977e6f030a61f7556f))
* add server metrics flusher and wire into node provider ([#17](https://github.com/Dynatrace/openfeature-provider-js/issues/17)) ([32e2cc5](https://github.com/Dynatrace/openfeature-provider-js/commit/32e2cc5dce5d8d7c36121d3e8f3aa4854e1f1625))
* rename metricsUrl to metricsOrigin, accept origin-only value ([#28](https://github.com/Dynatrace/openfeature-provider-js/issues/28)) ([28f5a14](https://github.com/Dynatrace/openfeature-provider-js/commit/28f5a144dbe27d841406eb042ad90efb2aeb9214))
* scaffold node provider package ([#13](https://github.com/Dynatrace/openfeature-provider-js/issues/13)) ([c773d09](https://github.com/Dynatrace/openfeature-provider-js/commit/c773d099ce3d11adf96d54db6b03109f24119571))
* wire flagd-core, polling, and provider state machine ([#16](https://github.com/Dynatrace/openfeature-provider-js/issues/16)) ([3a79745](https://github.com/Dynatrace/openfeature-provider-js/commit/3a79745be7f42b57e9ae8db823784be7cdaee6a9))


### 🐛 Bug Fixes

* reject configOrigin with user info and normalise the origin ([#26](https://github.com/Dynatrace/openfeature-provider-js/issues/26)) ([0ee4fbd](https://github.com/Dynatrace/openfeature-provider-js/commit/0ee4fbd2b4ce10bb40b382b210073a99a776e35c))


### 📚 Documentation

* add a runnable node provider quickstart example ([#35](https://github.com/Dynatrace/openfeature-provider-js/issues/35)) ([3b0b7d9](https://github.com/Dynatrace/openfeature-provider-js/commit/3b0b7d91aedf2be75da52cf27bff15eaf432b523))
* align READMEs with the standard provider format ([#32](https://github.com/Dynatrace/openfeature-provider-js/issues/32)) ([b7b8bfc](https://github.com/Dynatrace/openfeature-provider-js/commit/b7b8bfc7c1d5959a1d99ddbc02761c429f625760))
