# Changelog

## [0.9.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.8.0...skillx-sh-v0.9.0) (2026-10-29)


### Features

* **cli:** add skillx add to install skills from GitHub, git URLs or local paths ([#120](https://github.com/nextlevelbuilder/skillx/issues/120)) ([b53007c](https://github.com/nextlevelbuilder/skillx/commit/b53007c7b370402f66398ece273e739842b75f43))
* **cli:** lock, update and sync skills from skillx add; project scope, several runtimes, commit refs ([#168](https://github.com/nextlevelbuilder/skillx/issues/168)) ([c95ab77](https://github.com/nextlevelbuilder/skillx/commit/c95ab773d5c33670f07ed38babb61c1a4c8ddffb))
* **web:** creator dashboard with visibility, soft delete and restore ([#162](https://github.com/nextlevelbuilder/skillx/issues/162)) ([a81117b](https://github.com/nextlevelbuilder/skillx/commit/a81117bf6c5a7f8861e6edd4edd57413158cb4cc))

## [0.8.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.7.1...skillx-sh-v0.8.0) (2026-10-28)


### Features

* **mcp:** skill provenance, red flags and approval-gated install plans ([#155](https://github.com/nextlevelbuilder/skillx/issues/155)) ([3968b91](https://github.com/nextlevelbuilder/skillx/commit/3968b91c4ca3d8d9de5626fc1fff7dc15bd296d1))


### Bug Fixes

* **cli:** add `skillx use --exact` with no search or register fallback ([#158](https://github.com/nextlevelbuilder/skillx/issues/158)) ([f96a06a](https://github.com/nextlevelbuilder/skillx/commit/f96a06ac9947da1e10f928a755f380983d88fb58))

## [0.7.1](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.7.0...skillx-sh-v0.7.1) (2026-10-27)


### Bug Fixes

* **cli:** trust the production registry signing key by default ([#138](https://github.com/nextlevelbuilder/skillx/issues/138)) ([61d16be](https://github.com/nextlevelbuilder/skillx/commit/61d16be89778466a9bf42fbd2188651e4eca1b52))

## [0.7.0](https://github.com/nextlevelbuilder/skillx/compare/skillx-sh-v0.6.0...skillx-sh-v0.7.0) (2026-10-25)


### Features

* **cli:** add library list and kit authoring commands ([#135](https://github.com/nextlevelbuilder/skillx/issues/135)) ([9e6ec78](https://github.com/nextlevelbuilder/skillx/commit/9e6ec7822c480d81bef9584dc95d34b4d8a3d688))
* **library:** list the caller's owned and entitled skills and kits ([#133](https://github.com/nextlevelbuilder/skillx/issues/133)) ([d0a4910](https://github.com/nextlevelbuilder/skillx/commit/d0a491002754c3ba3d490d48d4df037cb4bbfaf3))
* **personal-kits:** answer kit.api_disabled while off and add an enablement smoke ([#127](https://github.com/nextlevelbuilder/skillx/issues/127)) ([6934e95](https://github.com/nextlevelbuilder/skillx/commit/6934e95a8b9982b30f309152296919aa44c8b0ed))
* **releases:** choose package visibility on publish, private by default ([#130](https://github.com/nextlevelbuilder/skillx/issues/130)) ([5fb1426](https://github.com/nextlevelbuilder/skillx/commit/5fb14264d12e56783785aa4219c303dae0e72552))
* **releases:** skillx.release/v2 kit provenance for [@agentkit](https://github.com/agentkit) releases ([#121](https://github.com/nextlevelbuilder/skillx/issues/121)) ([d62a18f](https://github.com/nextlevelbuilder/skillx/commit/d62a18f7d238cd1f6e3275b91b83d39201f31c3b))


### Bug Fixes

* **collections:** keep private packages out of collection views for readers who cannot read them ([#134](https://github.com/nextlevelbuilder/skillx/issues/134)) ([3caafa2](https://github.com/nextlevelbuilder/skillx/commit/3caafa22bd25ac7311f85c887aeca640e1f1427b))
* **releases:** v2 kit provenance review follow-ups ([#126](https://github.com/nextlevelbuilder/skillx/issues/126)) ([433a3da](https://github.com/nextlevelbuilder/skillx/commit/433a3dab5389e80a43d024e0c18b93d5d5a66a50)), closes [#123](https://github.com/nextlevelbuilder/skillx/issues/123)

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
