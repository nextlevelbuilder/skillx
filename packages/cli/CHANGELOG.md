# Changelog

## [0.6.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.5.0...skillx-sh-v0.6.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* **registry:** `skillx release publish --json` (now an alias of `skillx publish <dir>`) prints the `{"ok": true, "data": {...}}` / `{"ok": false, "error": {...}}` envelope instead of the bare release object, and failures use the documented exit codes instead of always 1. Read the release from `.data`.

### Features

* collections API and verified CLI installer with lockfile, sync and local MCP ([#35](https://github.com/nextlevelbuilder/skillx/issues/35) phase 3) ([#98](https://github.com/nextlevelbuilder/skillx/issues/98)) ([2c5a892](https://github.com/nextlevelbuilder/skillx/commit/2c5a89204eed0ffaaf1736e59a60fe19bec03638))
* finish Phase 1 discovery (CLI envelope, get_kit, WebMCP mirror, contracts in CLI) ([#97](https://github.com/nextlevelbuilder/skillx/issues/97)) ([79f98fb](https://github.com/nextlevelbuilder/skillx/commit/79f98fbaaf1d28bf26ddf5b19e7a76ca736a1367))
* **registry:** release CLI, idempotent publish, promote, quarantine review, signed downloads and GitHub OIDC trusted publishing ([#99](https://github.com/nextlevelbuilder/skillx/issues/99)) ([5fc3077](https://github.com/nextlevelbuilder/skillx/commit/5fc3077d2aa539a717fe69e259daf8648d9ccf6d))


### Bug Fixes

* **cli:** print "Nothing to update." when update finds nothing installed ([#118](https://github.com/nextlevelbuilder/skillx/issues/118)) ([bb57346](https://github.com/nextlevelbuilder/skillx/commit/bb5734639e438bd16e7506ec6838d9b6ac2cf6c7))

## [0.5.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.4.1...skillx-sh-v0.5.0) (2026-10-16)


### Features

* agent-native discovery and compatibility ([#90](https://github.com/nextlevelbuilder/skillx/issues/90)) ([40217d4](https://github.com/nextlevelbuilder/skillx/commit/40217d42e4c8c0459f4d629b40cec35adf3ab546))
* **kits:** accept reviewed session-derived overlay proposals ([#83](https://github.com/nextlevelbuilder/skillx/issues/83)) ([acfb24f](https://github.com/nextlevelbuilder/skillx/commit/acfb24faf8f8c77dfee07cf21077b920a65b39aa))
* **kits:** add personal kits with lineage, overlays and foundation rebase ([#82](https://github.com/nextlevelbuilder/skillx/issues/82)) ([3828417](https://github.com/nextlevelbuilder/skillx/commit/3828417b72d6dd55e7f55e4b9e1bfdea04e65818))
* **registry:** audited release state transitions and full-tree E2E (SX-5) ([#66](https://github.com/nextlevelbuilder/skillx/issues/66)) ([6c5557a](https://github.com/nextlevelbuilder/skillx/commit/6c5557a75947564893e4add1fd313408e0312996))
* **registry:** release pack, upload and signed manifests (SX-3) ([#59](https://github.com/nextlevelbuilder/skillx/issues/59)) ([ec8e143](https://github.com/nextlevelbuilder/skillx/commit/ec8e1431265de9666cc2db290a1d2c9215b7e9c6))


### Bug Fixes

* **cli:** keep yaml external so the built bundle starts ([#75](https://github.com/nextlevelbuilder/skillx/issues/75)) ([da98c9f](https://github.com/nextlevelbuilder/skillx/commit/da98c9f9ff108ec0a50a3be89259523f3f867267)), closes [#73](https://github.com/nextlevelbuilder/skillx/issues/73) [#63](https://github.com/nextlevelbuilder/skillx/issues/63)

## [0.4.1](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.4.0...skillx-sh-v0.4.1) (2026-09-22)


### Bug Fixes

* **cli:** read --version from package.json instead of a hardcoded constant ([#45](https://github.com/nextlevelbuilder/skillx/issues/45)) ([db4f97e](https://github.com/nextlevelbuilder/skillx/commit/db4f97e556f3851197d07389099e0fd96d38d0c9)), closes [#24](https://github.com/nextlevelbuilder/skillx/issues/24)
* **skills:** canonical skill identity from source repo and path ([#25](https://github.com/nextlevelbuilder/skillx/issues/25)) ([#43](https://github.com/nextlevelbuilder/skillx/issues/43)) ([04e3b7e](https://github.com/nextlevelbuilder/skillx/commit/04e3b7eabbb52dbab62c0ea5d1a8093b01b80dc9))

## [0.4.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.3.0...skillx-sh-v0.4.0) (2026-09-21)


### Features

* skill references & scripts support ([#9](https://github.com/nextlevelbuilder/skillx/issues/9)) ([9d0f9e9](https://github.com/nextlevelbuilder/skillx/commit/9d0f9e9f49b4727f58ed50f7ba5496ff7a0a902e))

## [0.3.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.2.0...skillx-sh-v0.3.0) (2026-03-05)


### Features

* **cli,api:** add skillx publish command with auth and ownership validation ([#4](https://github.com/nextlevelbuilder/skillx/issues/4)) ([eae3f53](https://github.com/nextlevelbuilder/skillx/commit/eae3f534cabf68806342308f9be6e8b9357c9f7e))
* **leaderboard:** add votes, sort/filter, preview modal, scoring updates ([#7](https://github.com/nextlevelbuilder/skillx/issues/7)) ([1636137](https://github.com/nextlevelbuilder/skillx/commit/16361374c1d9c1f2c78e0b54a066ad9d3550df63))
* **security:** add content scanning for SKILL.md files ([#6](https://github.com/nextlevelbuilder/skillx/issues/6)) ([ef47ca4](https://github.com/nextlevelbuilder/skillx/commit/ef47ca4a404ce8b3333b979eb096e77c907050a5))

## [0.2.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.1.3...skillx-sh-v0.2.0) (2026-02-13)


### Features

* **cli:** add find command for search and interactive selection ([3354e41](https://github.com/nextlevelbuilder/skillx/commit/3354e41943245d5b3c1f3f864d6e393c25a36fe7))
* **cli:** redesign identifier resolution for skillx use ([63e8a16](https://github.com/nextlevelbuilder/skillx/commit/63e8a16696df034f89e0836f026230544ef2bcfd))
* **cli:** rename npm package to skillx-sh and add README ([4e27faf](https://github.com/nextlevelbuilder/skillx/commit/4e27faf920a27d9b011e48f9c0478266c4b1f9b1))
* initial SkillX.sh MVP implementation ([83e22ae](https://github.com/nextlevelbuilder/skillx/commit/83e22aebda1cb6dd088baa739188925e56a94c74))
* **install:** track CLI installs with deduplicated counting ([e48a2e7](https://github.com/nextlevelbuilder/skillx/commit/e48a2e7eaea148b988b47d45faa90aca7b286764))
* **skills:** auto-register GitHub repos as skills ([ad062f6](https://github.com/nextlevelbuilder/skillx/commit/ad062f6c48f41de8d33a73c74e93ba248ee1864a))


### Bug Fixes

* cli use and search ([3f69be5](https://github.com/nextlevelbuilder/skillx/commit/3f69be55e45146c11c814f1a446008bf4861e9e3))
* **cli:** show full SKILL.md content in skillx use output ([0880ff5](https://github.com/nextlevelbuilder/skillx/commit/0880ff5fe11d58b11f6595f586d660a6120d9c68))

## [0.1.2](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.1.1...skillx-sh-v0.1.2) (2026-02-12)


### Features

* **cli:** add find command for search and interactive selection ([3354e41](https://github.com/nextlevelbuilder/skillx/commit/3354e41943245d5b3c1f3f864d6e393c25a36fe7))
* **cli:** rename npm package to skillx-sh and add README ([4e27faf](https://github.com/nextlevelbuilder/skillx/commit/4e27faf920a27d9b011e48f9c0478266c4b1f9b1))
* initial SkillX.sh MVP implementation ([83e22ae](https://github.com/nextlevelbuilder/skillx/commit/83e22aebda1cb6dd088baa739188925e56a94c74))
* **install:** track CLI installs with deduplicated counting ([e48a2e7](https://github.com/nextlevelbuilder/skillx/commit/e48a2e7eaea148b988b47d45faa90aca7b286764))
* **skills:** auto-register GitHub repos as skills ([ad062f6](https://github.com/nextlevelbuilder/skillx/commit/ad062f6c48f41de8d33a73c74e93ba248ee1864a))

## [0.1.1](https://github.com/nextlevelbuilder/skillx/compare/skillx-v0.1.0...skillx-v0.1.1) (2026-02-12)


### Features

* **cli:** add find command for search and interactive selection ([3354e41](https://github.com/nextlevelbuilder/skillx/commit/3354e41943245d5b3c1f3f864d6e393c25a36fe7))
* initial SkillX.sh MVP implementation ([83e22ae](https://github.com/nextlevelbuilder/skillx/commit/83e22aebda1cb6dd088baa739188925e56a94c74))
* **install:** track CLI installs with deduplicated counting ([e48a2e7](https://github.com/nextlevelbuilder/skillx/commit/e48a2e7eaea148b988b47d45faa90aca7b286764))
* **skills:** auto-register GitHub repos as skills ([ad062f6](https://github.com/nextlevelbuilder/skillx/commit/ad062f6c48f41de8d33a73c74e93ba248ee1864a))
