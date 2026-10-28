# Result cases

Classify every answer before presenting it. Codes come from the SkillX MCP tools; quote
the code when you explain a refusal so the user can look it up.

| Case | How you recognize it | What to tell the user |
|------|----------------------|-----------------------|
| Ranked results | `search_packages` returns `count > 0` | Show up to 5 result cards, most relevant first. Rank is relevance, not quality or safety. |
| No match | `count: 0` | Say SkillX has no matching skill. Quote `note` when present. Suggest one or two broader queries. Never invent a skill or substitute one from memory. |
| Filtered out | `compatibilityFilter.undecided > 0` | Say how many listings declare nothing for that runtime and could not be judged. Offer to search without the filter and mark those results `compatibility: unknown`. |
| Ambiguous | Two or more results share a name or purpose but differ in `author`, `slug` or `sourceUrl`; or the user's wording matches several slugs | Show them side by side with author, source and trust. Ask the user to choose. Do not pick by popularity. |
| Danger | `riskLabel: "danger"`, or `contentIncluded: false` with `contentOmitted` | Show metadata only, labelled "Flagged dangerous by SkillX's content scan; body withheld". Do not recommend it or give install steps. |
| Caution | `riskLabel: "caution"` | Recommend only with an explicit warning that the scan found risky patterns; suggest reading the SKILL.md at the source first. |
| Not scanned | `riskLabel: "unknown"` or missing | Say "not scanned: safety unknown". Never call it safe. |
| Paid or protected | `isPaid: true`, or `contentIncluded: false` without `contentOmitted` | Say the body is not public here. Do not guess what it contains. Link the SkillX page. |
| Unknown slug | `get_package` / `check_compatibility` answer `found: false`, `code: "not_found"` | Say SkillX has no listing with that name. Offer a search. |
| Private or unknown package | `get_release` answers `found: false`, `code: "not_found"` | Say "not found or not public". Never imply that a private package exists. |
| Quarantined | `code: "release_quarantined"` | Say the release is held for security review and cannot be used. Offer an alternative. |
| Revoked publisher | `code: "publisher_revoked"` | Say the publisher's releases are withdrawn and must not be used. |
| Yanked version | `code: "release_yanked"` | Say that version was withdrawn by its publisher. Offer the newest published version from `get_release` without `version`. |
| Tool error | `isError: true` (`invalid_arguments`, `internal_error`, `unknown_tool`) | Fix your arguments once if the code is `invalid_arguments`; otherwise tell the user SkillX could not answer. Do not fall back to guessing. |

## Pinned versus unpinned

- `get_release` answers describe immutable releases: `version`, `channel`, `state` and
  `releaseDigest` (`sha256:` + 64 hex). Show the digest when the user plans to adopt it.
- Catalog listings (`search_packages`, `get_package`) have a `version` and `updatedAt` but
  no digest; their content can change. Label them "Unpinned listing".
- A listing and a registry package with similar names are not proven to be the same
  thing. Do not attach a release digest to a listing unless the user names the package.

## Compatibility statuses

| Status | Meaning |
|--------|---------|
| `verified` | Evidence bound to the exact artifact digest. Strongest claim. |
| `declared` | The publisher says it supports the runtime. Not independently checked. |
| `unknown` | No claim. Not support, not incompatibility. |
| `unsupported` | The publisher says it does not support the runtime. Do not recommend it for that runtime. |
| `blocked` | The requested runtime version is outside the declared range, a required capability is missing, or the range cannot be read. Quote the reason codes; do not recommend it for that target. |
