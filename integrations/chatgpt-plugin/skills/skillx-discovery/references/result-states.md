# SkillX result states

Every SkillX tool answers "not found" and "the call failed" differently. Map each answer below to what you tell the user. Lead with the warning when there is one.

## Search (`search_packages`)

| Signal | Meaning | Tell the user |
|--------|---------|---------------|
| `count: 0` | No listing matched the query (and filter). | No SkillX listing matched. Repeat `note` if present. Suggest broader words or dropping the runtime filter. |
| Hits, but none about the request | Semantic search returns the nearest listings even when nothing fits; ranking fields such as `final_score` are relative, not a relevance threshold. | Treat it as no match: do not present off-topic hits as results. |
| `compatibilityFilter.undecided > 0` | Listings that declare no runtime were left out by `compatible`. | Some listings were hidden because they declare no compatibility; the user can search without the runtime filter and check each one. |
| Several hits with the same `name` | Different publishers ship skills with the same name. | List each with publisher and source; ask which one they mean. |
| `contentOmitted` on a hit | The scanner flagged it `danger`; its body is withheld. | Warn that it was flagged dangerous and do not recommend it. |

## Listing (`get_package`, `check_compatibility`)

| Signal | Meaning | Tell the user |
|--------|---------|---------------|
| `found: false`, `code: not_found` | No public listing with that slug. | It is not publicly listed on SkillX. Do not speculate that it exists privately. |
| `riskLabel: danger` | The content scanner found dangerous patterns. | Strong warning; do not recommend. |
| `riskLabel: caution` | The scanner found patterns that need review. | Warn that the content needs review before any use. |
| `riskLabel: unknown` | The listing was never scanned. | Say it has not been scanned; not a sign of safety. |
| `riskLabel: safe` | The scanner found nothing. | An automated scan found nothing; it is not an audit. |
| `protected: true` or `contentIncluded: false` | Paid or protected listing; only metadata is shown. | Say the content is not shown here. |
| Compatibility `declared` | The publisher claims support. | Supported per the publisher's claim. |
| Compatibility `verified` | Evidence is bound to the exact artifact digest. | Verified support for that release. |
| Compatibility `unsupported` / `blocked` | Decided against the target. | Not supported for that runtime. |
| Compatibility `unknown` / none | Nobody claimed anything. | Unknown - not evidence of support. |

## Release (`get_release`)

| Signal | Meaning | Tell the user |
|--------|---------|---------------|
| `found: true`, a release with `state: published` | A signed, immutable release exists. | Pinned: `@publisher/name@version`, channel, `releaseDigest`. |
| `found: false`, `code: not_found` | No public signed release (unknown, private or draft). | Unpinned listing: no signed release to pin. Never say why it is missing. |
| `code: release_quarantined` | The release is held for security review. | Quarantined: do not use until it is released. |
| `code: publisher_revoked` | The publisher is suspended or revoked. | The publisher was revoked; do not use their releases. |
| `code: release_yanked` | The publisher withdrew this version. | Yanked: pick another version or skip it. |

## Tool errors

A result with `isError: true` means the call failed (`details.code` such as `invalid_arguments` or `internal_error`), and a refused request (for example rate limiting) fails the call itself. Say the lookup failed and why; do not treat it as "no results", and do not fill the gap from memory.
