# @skillx/skill-tree

TypeScript port of the AgentKit `agentkit.skill-tree/v1` digest. It reads a tar,
tar.gz or zip archive (or presented entries) into a validated tree manifest
and its digest. Go parity is pinned by the vendored conformance vectors under
`fixtures/`.

## Runtime requirements

- Node.js 21.2 or later (`DecompressionStream("deflate-raw")`).
- Cloudflare Workers: enable the `nodejs_compat` compatibility flag. The
  package imports `node:crypto` (`createHash`) for SHA-256.
- `@skillx/skill-tree/rules` exports only the pure path, collision and
  identity rules (no Node.js import, no archive readers). Worker and browser
  code that validates manifests, such as `@skillx/contracts`, imports it.

## Ingest overhead guard (tar)

The tar reader caps the bytes it reads beyond hashed regular-file content at
`maxFiles × 64 KiB` (256 MiB at the default limits). That overhead covers
headers, PAX `x`/`g` and GNU `L`/`K` records, sparse maps, padding and the data
of non-regular entries. Regular-file content is bounded by the tree limits
(`maxFileSize`, `maxTreeSize`, `maxFiles`) as before.

- It only rejects (`tree.limit_exceeded`, detail naming the ingest overhead
  guard). It never changes a digest.
- It is a SkillX resource guard outside the Go parity claim. Go
  `archive/tar` has no such bound, and AgentKit has no tar reader; the
  contract governs `Build`.
- Known divergence: a non-regular entry (for example type `7` or a sparse
  file) whose data exceeds the guard fails with `tree.limit_exceeded`, where
  Go `Reader.Next` plus `Build` would read it fully and report
  `tree.unsupported_entry`.
