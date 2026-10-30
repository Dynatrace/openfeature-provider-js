# Changelog

## [0.3.1-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.3.0-alpha...openfeature-provider-web-v0.3.1-alpha) (2026-10-30)


### ✨ New Features

* add SSE change notifications to the node provider ([#37](https://github.com/Dynatrace/openfeature-provider-js/issues/37)) ([d86af5a](https://github.com/Dynatrace/openfeature-provider-js/commit/d86af5abf9deac1ab6e67779836855f4dc8deff1))


### 🐛 Bug Fixes

* expose ./package.json in package exports ([#40](https://github.com/Dynatrace/openfeature-provider-js/issues/40)) ([afae7b9](https://github.com/Dynatrace/openfeature-provider-js/commit/afae7b923ebb8523e7089b6c231fc087cc8a5435))


### 📚 Documentation

* align READMEs with the standard provider format ([#32](https://github.com/Dynatrace/openfeature-provider-js/issues/32)) ([b7b8bfc](https://github.com/Dynatrace/openfeature-provider-js/commit/b7b8bfc7c1d5959a1d99ddbc02761c429f625760))

## [0.3.0-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.2.7-alpha...openfeature-provider-web-v0.3.0-alpha) (2026-08-27)


### ⚠ BREAKING CHANGES

* rename metricsUrl to metricsOrigin, accept origin-only value ([#28](https://github.com/Dynatrace/openfeature-provider-js/issues/28))

### ✨ New Features

* rename metricsUrl to metricsOrigin, accept origin-only value ([#28](https://github.com/Dynatrace/openfeature-provider-js/issues/28)) ([28f5a14](https://github.com/Dynatrace/openfeature-provider-js/commit/28f5a144dbe27d841406eb042ad90efb2aeb9214))

## [0.2.7-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.2.6-alpha...openfeature-provider-web-v0.2.7-alpha) (2026-07-28)


### 🐛 Bug Fixes

* ICP-7735: handle string SSE data - [#21](https://github.com/Dynatrace/openfeature-provider-js/issues/21) ([#21](https://github.com/Dynatrace/openfeature-provider-js/issues/21)) ([f8a9e8e](https://github.com/Dynatrace/openfeature-provider-js/commit/f8a9e8e418acf293a08392a102711701c64cda9c))

## [0.2.6-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.2.5-alpha...openfeature-provider-web-v0.2.6-alpha) (2026-07-27)


### 🐛 Bug Fixes

* ICP-7735: Use Ably parser for message formats. ([#19](https://github.com/Dynatrace/openfeature-provider-js/issues/19)) ([3e445c8](https://github.com/Dynatrace/openfeature-provider-js/commit/3e445c87062c710dd59f9e71ee9f54f19c6f4729))

## [0.2.5-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.2.4-alpha...openfeature-provider-web-v0.2.5-alpha) (2026-07-14)


### ✨ New Features

* bump upstream web provider to enable SSE. ([#18](https://github.com/Dynatrace/openfeature-provider-js/issues/18)) ([ef9a355](https://github.com/Dynatrace/openfeature-provider-js/commit/ef9a35539eb9c55be7b0581a21dff160481e0ac9))
* scaffold node provider package ([#13](https://github.com/Dynatrace/openfeature-provider-js/issues/13)) ([c773d09](https://github.com/Dynatrace/openfeature-provider-js/commit/c773d099ce3d11adf96d54db6b03109f24119571))


### 🧹 Chore

* **deps-dev:** Bump vite in /packages/web/examples/react-app ([#7](https://github.com/Dynatrace/openfeature-provider-js/issues/7)) ([1200145](https://github.com/Dynatrace/openfeature-provider-js/commit/1200145fa9026fe12966bd3454e8ff64a635966f))


### 🔄 Refactoring

* extract shared SDK key parsing and URL helpers ([#11](https://github.com/Dynatrace/openfeature-provider-js/issues/11)) ([4e805b7](https://github.com/Dynatrace/openfeature-provider-js/commit/4e805b71197647d867c65d5a81d8f0336dee2afb))
* split shared metrics core from browser transport ([#12](https://github.com/Dynatrace/openfeature-provider-js/issues/12)) ([e77dc2a](https://github.com/Dynatrace/openfeature-provider-js/commit/e77dc2a98c51889932298b7d3f28283dc83e4f52))

## [0.2.4-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.2.3-alpha...openfeature-provider-web-v0.2.4-alpha) (2026-06-19)


### 🐛 Bug Fixes

* docs ([40ca6e3](https://github.com/Dynatrace/openfeature-provider-js/commit/40ca6e3838beefba5ef4a5ad4c69f0dd37b6ec00))

## [0.2.3-alpha](https://github.com/Dynatrace/openfeature-provider-js/compare/openfeature-provider-web-v0.2.2-alpha...openfeature-provider-web-v0.2.3-alpha) (2026-06-19)


### ✨ New Features

* migrate openfeature-provider-web into monorepo ([#4](https://github.com/Dynatrace/openfeature-provider-js/issues/4)) ([5311773](https://github.com/Dynatrace/openfeature-provider-js/commit/531177395d94dcb475d573b8c0d146a6852f5f6f))

## [0.2.2-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.2.1-alpha...v0.2.2-alpha) (2026-06-01)


### 🐛 Bug Fixes

* remove hard coding the version in constructor ([#30](https://github.com/Dynatrace/openfeature-provider-web/issues/30)) ([e57e5c7](https://github.com/Dynatrace/openfeature-provider-web/commit/e57e5c7b82b88850c6fcfc746529f37c6d4b9814))

## [0.2.1-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.2.0-alpha...v0.2.1-alpha) (2026-05-28)


### ✨ New Features

* add temp metricsUrl option to web provider ([#28](https://github.com/Dynatrace/openfeature-provider-web/issues/28)) ([f3f5a0e](https://github.com/Dynatrace/openfeature-provider-web/commit/f3f5a0e34d2d3325e2a8159fdbb05b16014cf3e9))

## [0.2.0-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.1.5-alpha...v0.2.0-alpha) (2026-05-27)


### ⚠ BREAKING CHANGES

* rename baseUrl option to apiOrigin ([#27](https://github.com/Dynatrace/openfeature-provider-web/issues/27))

### ✨ New Features

* accept SDK key as first constructor argument ([#26](https://github.com/Dynatrace/openfeature-provider-web/issues/26)) ([696f4db](https://github.com/Dynatrace/openfeature-provider-web/commit/696f4dbb82403dad347716814ef81a674609aace))
* added evaluation metrics hook ([#12](https://github.com/Dynatrace/openfeature-provider-web/issues/12)) ([0c11646](https://github.com/Dynatrace/openfeature-provider-web/commit/0c116466a0e515c04d1176b17a12316ce6d1c738))
* rename baseUrl option to apiOrigin ([#27](https://github.com/Dynatrace/openfeature-provider-web/issues/27)) ([7b18fdc](https://github.com/Dynatrace/openfeature-provider-web/commit/7b18fdcbd1cf5168ad95fb11a30429decd40101a))


### 🧹 Chore

* **deps:** update example app to react 19, typescript 6, vite 8 ([#24](https://github.com/Dynatrace/openfeature-provider-web/issues/24)) ([4000162](https://github.com/Dynatrace/openfeature-provider-web/commit/4000162b6a8fa62254b3a36122ac473cd4085f2f))

## [0.1.5-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.1.4-alpha...v0.1.5-alpha) (2026-05-15)


### 🐛 Bug Fixes

* publish prerelease versions to latest tag ([#22](https://github.com/Dynatrace/openfeature-provider-web/issues/22)) ([faf732e](https://github.com/Dynatrace/openfeature-provider-web/commit/faf732e4b4820ec6cb8f5837108f3c1525ff51b0))

## [0.1.4-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.1.3-alpha...v0.1.4-alpha) (2026-05-15)


### 🐛 Bug Fixes

* publish to latest tag instead of alpha ([#20](https://github.com/Dynatrace/openfeature-provider-web/issues/20)) ([64b218c](https://github.com/Dynatrace/openfeature-provider-web/commit/64b218cd8c7ba7ff8b7bbfc213944dc576b07a9c))

## [0.1.3-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.1.2-alpha...v0.1.3-alpha) (2026-05-15)


### 🐛 Bug Fixes

* use access and tag config keys instead of publishArgs ([#18](https://github.com/Dynatrace/openfeature-provider-web/issues/18)) ([0a08202](https://github.com/Dynatrace/openfeature-provider-web/commit/0a082024fd47fbeaefded3985c3109024fc363ef))

## [0.1.2-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.1.1-alpha...v0.1.2-alpha) (2026-05-15)


### 🐛 Bug Fixes

* pass npm publish args via clean-publish config ([#16](https://github.com/Dynatrace/openfeature-provider-web/issues/16)) ([2e523cd](https://github.com/Dynatrace/openfeature-provider-web/commit/2e523cd07963b16e4d6798ada491aafc77868654))

## [0.1.1-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.1.0-alpha...v0.1.1-alpha) (2026-05-15)


### 🐛 Bug Fixes

* clean up published package.json ([#13](https://github.com/Dynatrace/openfeature-provider-web/issues/13)) ([4c56342](https://github.com/Dynatrace/openfeature-provider-web/commit/4c56342f45f55b438618a0df3c30b72d731d1ec8))

## [0.1.0-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.0.6-alpha...v0.1.0-alpha) (2026-05-13)

### ✨ New Features

- added initial dynatrace provider ([#5](https://github.com/Dynatrace/openfeature-provider-web/issues/5)) ([2ac9f32](https://github.com/Dynatrace/openfeature-provider-web/commit/2ac9f322aadc56e6fc185e1dcdb8c61d8a3dc987))

### 🧹 Chore

- add prettier ([#9](https://github.com/Dynatrace/openfeature-provider-web/issues/9)) ([86e84ea](https://github.com/Dynatrace/openfeature-provider-web/commit/86e84ea079c1bd234206e52d07cc7e744d2f7fb0))
- fix formatting and update copyright information in LICENSE ([#6](https://github.com/Dynatrace/openfeature-provider-web/issues/6)) ([b4ddf1b](https://github.com/Dynatrace/openfeature-provider-web/commit/b4ddf1b39864a389a214dc9481435ee282946cf1))
- lint single-commit PR messages ([#7](https://github.com/Dynatrace/openfeature-provider-web/issues/7)) ([d6b2a83](https://github.com/Dynatrace/openfeature-provider-web/commit/d6b2a83bdc301f8179c522631b8fe585854bcd91))
- run tests on ci ([#10](https://github.com/Dynatrace/openfeature-provider-web/issues/10)) ([39d1257](https://github.com/Dynatrace/openfeature-provider-web/commit/39d125714fa5c428cb03b19b0c8e3a10006d6a2e))

## [0.0.6-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.0.5-alpha...v0.0.6-alpha) (2026-04-16)

### 🧹 Chore

- revert provenance until repo public ([071269a](https://github.com/Dynatrace/openfeature-provider-web/commit/071269a010793415b8b8045d7eb3550b84c2be02))

## [0.0.5-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.0.4-alpha...v0.0.5-alpha) (2026-04-16)

### 🧹 Chore

- add provenance ([f30322b](https://github.com/Dynatrace/openfeature-provider-web/commit/f30322b2642be0b7e725df588f1c7139698c8398))

## [0.0.4-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.0.3-alpha...v0.0.4-alpha) (2026-04-16)

### 🧹 Chore

- additional publishing configuration ([1f680e4](https://github.com/Dynatrace/openfeature-provider-web/commit/1f680e495fa3d7d8fc9e124ceb1a7dcffd6f6c24))

## [0.0.3-alpha](https://github.com/Dynatrace/openfeature-provider-web/compare/v0.0.2-alpha...v0.0.3-alpha) (2026-04-16)

### 🧹 Chore

- add tag and remove publish meta ([d6a8030](https://github.com/Dynatrace/openfeature-provider-web/commit/d6a803042d30f4a0d48e204d9726a681b7d67a95))
- initial publish infra ([0330d40](https://github.com/Dynatrace/openfeature-provider-web/commit/0330d40425ed5a11f01a9ecf21f74f17e37188c1))
