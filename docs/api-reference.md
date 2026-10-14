# API Reference

REST API for the SkillX marketplace. Base URL: `https://skillx.sh`

## Authentication

Two auth methods supported. Anonymous access allowed on read endpoints.

### Session Cookie

Browser-based auth via Better Auth + GitHub OAuth. Session set automatically after login at `/api/auth/signin/social`.

### API Key (Bearer Token)

For CLI and external integrations. Pass in `Authorization` header:

```
Authorization: Bearer sx_<64-hex-chars>
```

Key format: `sx_` prefix + 64 hex characters (32 random bytes). First 8 chars used as prefix identifier. Keys stored as SHA-256 hashes — plaintext shown only once at creation.

Generate keys via `POST /api/user/api-keys` (requires session auth).

---

## Endpoints

### Search

#### `GET /api/search`

Search skills via hybrid keyword + semantic engine. Supports query params.

**Auth**: Optional (authenticated users get personalized favorite boost)

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Search query |
| `category` | string | No | — | Filter by category |
| `is_paid` | string | No | — | `"true"` or `"false"` |
| `limit` | number | No | 20 | Max results (capped at 100) |

**Response** `200`:

```json
{
  "results": [
    {
      "id": "uuid",
      "name": "Skill Name",
      "slug": "skill-name",
      "description": "...",
      "category": "development",
      "avg_rating": 8.5,
      "install_count": 1200,
      "github_stars": 450,
      "final_score": 0.82,
      "rrf_score": 0.031,
      "semantic_rank": 2,
      "keyword_rank": 5
    }
  ],
  "count": 1
}
```

Returns empty `{ "results": [], "count": 0 }` if no `q` param.

#### `POST /api/search`

Same search via JSON body. Preferred for API integrations.

**Auth**: Optional

**Request Body**:

```json
{
  "query": "kubernetes deploy",
  "category": "devops",
  "is_paid": false,
  "limit": 20
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `category` | string | No | Filter by category |
| `is_paid` | boolean | No | Filter free/paid |
| `limit` | number | No | Max results (default 20, max 100) |

**Response**: Same as `GET /api/search`.

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Query parameter is required..." }` | Missing or non-string `query` |
| 500 | `{ "error": "Search failed", "details": "..." }` | Internal error |

---

### Skills

#### `GET /api/skills/:slug`

Fetch full skill details with reviews and rating summary.

**Auth**: Optional (authenticated users see `isFavorited` status)

**URL Params**: `slug` — skill URL slug

**Response** `200`:

```json
{
  "skill": {
    "id": "uuid",
    "name": "Skill Name",
    "slug": "skill-name",
    "description": "...",
    "content": "Full markdown content...",
    "author": "author-name",
    "source_url": "https://github.com/...",
    "category": "development",
    "install_command": "skillx use skill-name",
    "version": "1.2.0",
    "is_paid": false,
    "price_cents": 0,
    "avg_rating": 8.5,
    "rating_count": 42,
    "github_stars": 450,
    "install_count": 1200,
    "created_at": "2025-01-15T00:00:00.000Z",
    "updated_at": "2025-02-10T00:00:00.000Z"
  },
  "reviews": [
    {
      "id": "review-...",
      "skill_id": "uuid",
      "user_id": "user-uuid",
      "content": "Great skill!",
      "is_agent": false,
      "created_at": 1707955200000
    }
  ],
  "isFavorited": false,
  "ratingSummary": {
    "avgRating": 8.5,
    "ratingCount": 42
  }
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Skill slug is required" }` | Missing slug |
| 404 | `{ "error": "Skill not found" }` | Invalid slug |

---

### Ratings

#### `POST /api/skills/:slug/rate`

Rate a skill (0-10 scale). Upserts — re-rating updates existing score.

**Auth**: Required (session)

**URL Params**: `slug` — skill URL slug

**Request Body**:

```json
{
  "score": 8.5
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `score` | number | Yes | 0-10 inclusive |

**Response** `200`:

```json
{
  "success": true,
  "avg_rating": 8.2,
  "rating_count": 43
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Score must be a number between 0 and 10" }` | Invalid score |
| 401 | `{ "error": "Authentication required" }` | Not logged in |
| 404 | `{ "error": "Skill not found" }` | Invalid slug |

---

### Votes

#### `POST /api/skills/:slug/vote`

Upvote or downvote a skill. Vote is toggled off if same direction already exists.

**Auth**: Required (session)

**URL Params**: `slug` — skill URL slug

**Request Body**:

```json
{
  "direction": "up"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `direction` | string | Yes | `"up"` or `"down"` |

**Response** `200`:

```json
{
  "success": true,
  "direction": "up",
  "upvote_count": 42,
  "downvote_count": 3,
  "net_votes": 39
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Invalid direction" }` | Direction not `up` or `down` |
| 401 | `{ "error": "Authentication required" }` | Not logged in |
| 404 | `{ "error": "Skill not found" }` | Invalid slug |

---

### Reviews

#### `GET /api/skills/:slug/review`

List reviews for a skill, newest first (max 100).

**Auth**: None

**Response** `200`:

```json
{
  "reviews": [
    {
      "id": "review-...",
      "skill_id": "uuid",
      "user_id": "user-uuid",
      "content": "Excellent skill for Kubernetes deployment",
      "is_agent": false,
      "created_at": 1707955200000
    }
  ]
}
```

#### `POST /api/skills/:slug/review`

Submit a text review for a skill.

**Auth**: Required (session)

**Request Body**:

```json
{
  "content": "This skill saved me hours of work!"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `content` | string | Yes | 1-2000 characters |

**Response** `200`:

```json
{
  "success": true,
  "review": {
    "id": "review-...",
    "skill_id": "uuid",
    "user_id": "user-uuid",
    "content": "This skill saved me hours of work!",
    "is_agent": false,
    "created_at": 1707955200000
  }
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Review content cannot be empty" }` | Empty content |
| 400 | `{ "error": "Review content cannot exceed 2000 characters" }` | Too long |
| 401 | `{ "error": "Authentication required" }` | Not logged in |
| 404 | `{ "error": "Skill not found" }` | Invalid slug |

---

### Favorites

#### `POST /api/skills/:slug/favorite`

Toggle favorite status for a skill. Adds if not favorited, removes if already favorited.

**Auth**: Required (session)

**Request Body**: None (empty body OK)

**Response** `200`:

```json
{
  "favorited": true
}
```

`favorited: true` = added, `favorited: false` = removed.

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 401 | `{ "error": "Authentication required" }` | Not logged in |
| 404 | `{ "error": "Skill not found" }` | Invalid slug |

---

### User Interactions

#### `GET /api/user/interactions`

Fetch current user's ratings, reviews, votes, and favorites in one call.

**Auth**: Required (session)

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `limit` | number | No | 50 | Max results per category (max 100) |

**Response** `200`:

```json
{
  "ratings": [
    { "skill_slug": "skill-1", "score": 8 }
  ],
  "reviews": [
    { "skill_slug": "skill-1", "content": "Great skill!" }
  ],
  "votes": [
    { "skill_slug": "skill-2", "direction": "up" }
  ],
  "favorites": [
    { "skill_slug": "skill-3" }
  ]
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 401 | `{ "error": "Authentication required" }` | Not logged in |

---

### Usage Reports

#### `POST /api/report`

Report skill execution outcome. Used by CLI to track success rates.

**Auth**: Required (API key only)

**Request Body**:

```json
{
  "skill_slug": "kubernetes-deploy",
  "outcome": "success",
  "model": "claude-sonnet-4-5-20250929",
  "duration_ms": 12500
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `skill_slug` | string | Yes | Must match existing skill |
| `outcome` | string | Yes | `"success"`, `"failure"`, or `"partial"` |
| `model` | string | No | AI model used |
| `duration_ms` | number | No | Execution time in ms |

**Response** `200`:

```json
{
  "success": true
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "skill_slug is required" }` | Missing slug |
| 400 | `{ "error": "outcome must be 'success', 'failure', or 'partial'" }` | Invalid outcome |
| 401 | `{ "error": "API key required..." }` | Missing/invalid API key |
| 404 | `{ "error": "Skill not found" }` | Invalid slug |

---

### Leaderboard

#### `GET /api/leaderboard`

Paginated skill leaderboard with composite scoring and signal badges. KV cached (5min TTL).

**Auth**: None

**Query Parameters**:

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `sort` | string | No | `"best"` | `"best"`, `"rating"`, `"votes"`, `"installs"`, `"trending"`, or `"newest"` (NEW: `"votes"`) |
| `category` | string | No | — | Filter by category (e.g., `"data"`, `"analytics"`) (NEW) |
| `offset` | number | No | 0 | Pagination offset |
| `limit` | number | No | 20 | Results per page (max 50) |

**Response** `200`:

```json
{
  "entries": [
    {
      "rank": 1,
      "slug": "skill-name",
      "name": "Skill Name",
      "author": "author",
      "description": "Brief description",
      "category": "data",
      "installs": 1200,
      "rating": 8.5,
      "upvotes": 42,
      "downvotes": 3,
      "netVotes": 39,
      "badges": ["top-rated", "popular"]
    }
  ],
  "hasMore": true
}
```

`hasMore: true` indicates more pages available at `offset + limit`.

**Badges**: `"top-rated"`, `"popular"`, `"trending"`, `"well-maintained"`, `"community-pick"` — assigned based on p90 thresholds.

---

### API Keys

#### `GET /api/user/api-keys`

List current user's active (non-revoked) API keys with masked values.

**Auth**: Required (session)

**Response** `200`:

```json
{
  "keys": [
    {
      "id": "key-...",
      "name": "My CLI Key",
      "key_prefix": "sx_a1b2c",
      "key_masked": "sx_a1b2c...",
      "last_used_at": 1707955200000,
      "created_at": 1707868800000,
      "scopes": null
    }
  ]
}
```

`scopes` is `null` for an unscoped (legacy) key, otherwise the list of scopes.

#### `POST /api/user/api-keys`

Generate a new API key. Plaintext returned **once** — not stored.

**Auth**: Required (session)

**Request Body**:

```json
{
  "name": "My CLI Key"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | No | Max 100 chars (default: `"Default"`) |
| `scopes` | string[] | No | 1-8 entries of `releases:publish:@<handle>`; each handle must be an active publisher you own (`403` otherwise) |

**Response** `200`:

```json
{
  "success": true,
  "key": "sx_a1b2c3d4e5f6...",
  "scopes": null,
  "message": "Save this key securely. It will not be shown again."
}
```

A scoped key is accepted only by endpoints that check its scope (today the
release publish API). Endpoints that take unscoped keys (`authenticateRequest`,
skill install and usage reports) reject scoped keys, so a CI publish key cannot
act as the user anywhere else. A scoped key is stored under a domain-separated
hash (`hashScopedApiKey`), so this also holds for code that predates scopes.

#### `DELETE /api/user/api-keys`

Revoke an API key (soft delete — sets `revoked_at` timestamp).

**Auth**: Required (session)

**Request Body**:

```json
{
  "id": "key-..."
}
```

**Response** `200`:

```json
{
  "success": true
}
```

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Key ID is required" }` | Missing ID |
| 401 | `{ "error": "Authentication required" }` | Not logged in |
| 404 | `{ "error": "API key not found or already revoked" }` | Invalid/revoked key |
| 405 | `{ "error": "Method not allowed" }` | Unsupported HTTP method |

---

### Skill Registration

#### `POST /api/skills/register`

Register and publish skills from a GitHub repository. Scans for SKILL.md files, validates ownership, and stores with content security scanning.

**Auth**: Required (session or API key)

**Request Body**:

```json
{
  "owner": "github-username",
  "repo": "repo-name",
  "skill_path": "path/to/skill",    // optional: specific skill subfolder
  "scan": true                       // optional: scan entire repo
}
```

**Fields:**
- `owner` (string, required): GitHub username or org
- `repo` (string, required): Repository name
- `skill_path` (string, optional): Specific skill subfolder path
- `scan` (boolean, optional): Scan entire repo for SKILL.md files

**Response** `200` (single skill):

```json
{
  "skill": {
    "slug": "owner-skill-name",
    "name": "Skill Name",
    "author": "github-username",
    "description": "..."
  },
  "created": true
}
```

**Response** `200` (multiple skills):

```json
{
  "skills": [
    { "slug": "owner-skill-1", "name": "...", "author": "..." },
    { "slug": "owner-skill-2", "name": "...", "author": "..." }
  ],
  "registered": 2,
  "skipped": 1
}
```

**Features**:
- Content scanned for prompt injection, invisible chars, ANSI escapes, shell injection
- Risk label assigned: `"safe"`, `"caution"`, `"danger"`, or `"unknown"`
- Suspicious content sanitized before storage (zero-width chars + ANSI escapes removed)
- GitHub write access validated before publishing

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "..." }` | Invalid input or validation failure |
| 401 | `{ "error": "Authentication required" }` | Not logged in |
| 403 | `{ "error": "No write access to GitHub repo" }` | Insufficient repo permissions |
| 404 | `{ "error": "No SKILL.md files found" }` | Repo doesn't contain skills |

---

### Auth (Better Auth)

#### `* /api/auth/*`

Better Auth handler — manages GitHub OAuth flow, sessions, and account linking.

Key routes (handled by Better Auth internally):

| Route | Description |
|-------|-------------|
| `GET /api/auth/signin/social` | Initiate GitHub OAuth |
| `GET /api/auth/callback/github` | OAuth callback |
| `GET /api/auth/session` | Get current session |
| `POST /api/auth/signout` | Sign out |

Session expires after 7 days, refreshes after 1 day of activity.

---

### Admin

#### `POST /api/admin/seed`

Bulk upsert skills and index into Vectorize. For seeding demo/production data.

**Auth**: Admin secret via `X-Admin-Secret` header

**Request Body**: Array of skill objects:

```json
[
  {
    "name": "Kubernetes Deploy",
    "slug": "kubernetes-deploy",
    "description": "Deploy to K8s clusters",
    "content": "Full skill content...",
    "author": "skillx",
    "category": "devops",
    "source_url": "https://github.com/...",
    "install_command": "skillx use kubernetes-deploy",
    "version": "1.0.0",
    "is_paid": false,
    "price_cents": 0,
    "avg_rating": 8.5,
    "rating_count": 42,
    "github_stars": 450,
    "install_count": 1200
  }
]
```

| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes |
| `slug` | string | Yes |
| `description` | string | Yes |
| `content` | string | Yes |
| `author` | string | Yes |
| `category` | string | Yes |
| `source_url` | string | No |
| `install_command` | string | No |
| `version` | string | No (default `"1.0.0"`) |
| `is_paid` | boolean | No (default `false`) |
| `price_cents` | number | No (default `0`) |
| `avg_rating` | number | No (default `0`) |
| `rating_count` | number | No (default `0`) |
| `github_stars` | number | No (default `0`) |
| `install_count` | number | No (default `0`) |

**Response** `200`:

```json
{
  "skills": 30,
  "vectors": 120,
  "scoresRecomputed": 30
}
```

`skills` = rows upserted, `vectors` = chunks indexed into Vectorize, `scoresRecomputed` = leaderboard scores recalculated.

**Errors**:

| Status | Body | Cause |
|--------|------|-------|
| 400 | `{ "error": "Request body must be an array of skills" }` | Non-array body |
| 401 | `{ "error": "Unauthorized" }` | Missing/wrong admin secret |

---

## Release Manifest Contract (`skillx.release/v1`)

Contract only: no endpoint serves or accepts release manifests yet. The
publisher pipeline and pinned read API build on it. Source:
`packages/contracts/src/release-manifest.ts`; canonical JSON:
`packages/contracts/src/canonical-json.ts`.

A release manifest pins one immutable `@publisher/slug@version` to the
`agentkit.skill-tree/v1` tree of its files. It is signed once and never
changes; the release lifecycle state is a separate signed document
(`skillx.release-status/v1`, below). It is a JSON object with exactly these
members; unknown members (including `state`) are rejected at every level.

| Member | Type | Rule |
|--------|------|------|
| `schemaVersion` | string | `skillx.release/v1` |
| `identity` | string | `PACKAGE_NAME_PATTERN`, publisher and slug pass the tree segment rules; `@agentkit/*` is rejected (`identity.reserved_publisher`) |
| `version` | string | SemVer 2.0 without build metadata (`+...`) or leading zeros in numeric identifiers, at most 128 characters (`RELEASE_VERSION_PATTERN`; stricter than the package-wide `SEMVER_PATTERN`) |
| `channel` | string | `stable`, `beta`, `alpha` |
| `kind` | string | `skill`, `hook-pack`, `bundle` |
| `releaseDigest` | string | `sha256:<64 lowercase hex>`; equals the tree digest of `files` and is the release identity |
| `artifactDigest` | string | `sha256:<64 lowercase hex>` of the transport archive; integrity only, never an identity |
| `artifactSize` | integer | positive |
| `files` | array | non-empty, at most 4096 entries of `{ path, mode, sha256, size }`, sorted by raw UTF-8 path bytes, no duplicates or case-fold collisions; `path` passes the tree path, NFC and noise rules; `mode` is `100644` or `100755`; `sha256` is bare lowercase hex; `size` at most 32 MiB |
| `fileCount` | integer | equals `files.length` |
| `treeSize` | integer | sum of file sizes, at most 256 MiB |
| `publisher` | object | `{ handle, verifiedBy }`; `handle` equals the identity publisher; `verifiedBy` is `none`, `github` or `admin` (`none` means not publisher-verified). The signature is a registry key, never a publisher key, so consumers MUST NOT map these releases to trust `publisher-signed`. AgentKit will expose a verified registry signature as `registry-signed` once its skill-lifecycle contract adds that value (bestagentkits/agentkit#2277); until then the AgentKit contract defines the mapping |
| `sourceProvenance` | object or `null` | `{ repo, commit, path }`: https URL without credentials, full lowercase hex commit, package root path (`""` for the repository root). `null` when the release was not packed from a recorded git commit; consumers must label such a release "provenance unknown" |
| `declaredScripts` | array | paths from `files`, unique and sorted like `files`; informational, never executed by SkillX |
| `createdAt` | string | RFC 3339 UTC with whole seconds, e.g. `2026-10-13T04:30:00Z` |
| `keyId` | string | `^[a-z0-9][a-z0-9._-]{1,63}$` |
| `signatureAlgorithm` | string | `ed25519` |
| `signature` | string | padded standard base64 of the 64-byte Ed25519 signature: `^[A-Za-z0-9+/]{85}[AQgw]==$` (the unused trailing bits are zero, so each signature has one accepted text) |

### Signature bytes

The signature covers the UTF-8 bytes of the canonical JSON of the manifest
with only the `signature` member removed (so `keyId` and `signatureAlgorithm`
are signed). Canonical JSON is the RFC 8785 form restricted to this value
space:

- object members sorted by key (UTF-16 code units; every key is ASCII), no whitespace anywhere;
- arrays keep their order; numbers are non-negative safe integers in plain decimal;
- strings escape only `"` (`\"`), `\` (`\\`), U+0008/09/0A/0C/0D (`\b \t \n \f \r`) and other
  code points below U+0020 (`\u00xx`, lowercase hex); everything else, including `/`, `<`,
  `>`, `&`, U+2028 and U+2029, is raw UTF-8;
- no BOM, no trailing newline.

Go's `encoding/json.Marshal` does not produce these bytes (it HTML-escapes and
escapes U+2028/U+2029); a verifier must re-encode with the rules above.

**Served bytes.** A served manifest or status document is exactly the
canonical JSON of the whole document, `signature` included. A verifier parses
the received bytes, re-encodes the parsed value with the rules above and
rejects any byte difference (`release.non_canonical`, `status.non_canonical`).
That one comparison rejects whitespace, member order, duplicate members
(parsers disagree on which wins; Go keeps the last), escape variants, number
forms such as `1e3` or `1.0`, a BOM, trailing bytes and invalid UTF-8, so
every verifier signs and checks the same value. In Go: decode with
`json.Decoder.UseNumber()` into `any`, re-encode, `bytes.Equal`.

**Domain separation.** There is no prefix before the signed payload. Each
payload carries its own `schemaVersion`, each verifier requires its one schema
version and rejects unknown members, and registry release keys sign only these
two schemas, so a signature over one document type never verifies as the other.

**Tree digest.** `releaseDigest` must equal `sha256:` plus the hex SHA-256 of
the `agentkit.skill-tree/v1` serialization of `files`
(`agentkit.skill-tree/v1\n`, then `<mode> <sha256> <size> <path>\n` per file in
UTF-8 path byte order). Signing refuses and verification rejects a mismatch
(`release.tree_digest_mismatch`). `@skillx/skill-tree/rules` exports the pure
`serializeTree`; `releaseTreeDigest` hashes it with WebCrypto.

A verifier checks, in this order: canonical bytes, structure, tree digest,
signature. Validators and verifiers never throw on document input.

Cross-language vectors: `packages/contracts/src/fixtures/release-manifest-v1.json`
(signed valid documents with their exact signing payload, tree serialization
and file contents, including paths whose UTF-8 order differs from UTF-16
order; rejected documents with their single expected code: tampered, wrong
key, unknown key, Go-escaped, non-zero unused base64 bits in the signature
(`pattern`; a lenient decoder such as Go's `base64.StdEncoding` without
`.Strict()` accepts it, so verifiers must use the strict pattern), tree digest
mismatch, case-variant member and non-canonical byte variants; structure-only invalid-manifest cases). The
vector key is derived from a public seed text and must never be trusted
outside tests.

### Release status (`skillx.release-status/v1`)

The mutable state of a release is a separately signed document with the same
signature bytes rules (canonical JSON without `signature`, Ed25519, padded
base64). Source: `packages/contracts/src/release-status.ts`.

| Member | Type | Rule |
|--------|------|------|
| `schemaVersion` | string | `skillx.release-status/v1` |
| `releaseDigest` | string | `releaseDigest` of the manifest the status describes |
| `manifestDigest` | string | `sha256:<64 lowercase hex>` of that manifest's signing payload (below); names exactly one release |
| `state` | string | `draft`, `quarantined`, `published`, `yanked` |
| `reason` | string, optional | 1 to 512 UTF-8 bytes; no `Cc`, `Cf` (including every bidi control), `Zl`, `Zp` or `Cs` code points, classified with the same pinned Unicode 15.0 tables as the tree path rules (not the runtime's Unicode data); omit the member when there is none (never `null` or `""`) |
| `issuedAt` | string | RFC 3339 UTC with whole seconds; not before the manifest's `createdAt` |
| `expiresAt` | string | RFC 3339 UTC with whole seconds; after `issuedAt` and at most 7 days later |
| `sequence` | integer | strictly increasing per `manifestDigest`, starting at 1; the status with sequence 1 is `draft` or `published` |
| `keyId` | string | `^[a-z0-9][a-z0-9._-]{1,63}$` |
| `signatureAlgorithm` | string | `ed25519` |
| `signature` | string | padded standard base64 of the 64-byte Ed25519 signature |

**Manifest digest.** `manifestDigest` is `sha256:` followed by the lowercase
hex SHA-256 of the manifest signing payload: the UTF-8 canonical JSON of the
signed `skillx.release/v1` manifest with only `signature` removed, i.e. the
exact bytes the manifest signature covers (`releaseManifestDigest`). It covers
`keyId` and `signatureAlgorithm` but not the signature encoding. The same tree
(`releaseDigest`) released under another identity or version has a different
manifest digest, so a status never applies to a sibling release.

**Freshness.** Every status expires. The registry signs every status with
`expiresAt = issuedAt + 24h` and re-signs the current status (a new
`sequence`, same state) once it is 12 hours old, when it is next requested
(see [Signed release status](#signed-release-status)), so a fetched status
always has at least 12 hours left; the 7-day limit is a hard cap for the contract,
not the issuing cadence, and it is the worst-case staleness a consumer can be
held to. A consumer may keep using an expired status only for content it
already installed; an expired status never authorizes a new resolution or
install. A status whose `issuedAt` is more than 300 seconds ahead of the
consumer's clock is `status.not_yet_valid`, so a future-dated status can
neither outlive the lifetime bound nor, once accepted, lock out correctly
timed later statuses.

**Issuer obligations.** Every new status of a release has a higher `sequence`
and an `issuedAt` at least 1 second later than the previous status (timestamps
have whole-second resolution; an issuer that yanks within the same second as a
re-sign bumps `issuedAt` by 1 second), otherwise consumers reject it as
`status.issued_at_regression`.

**Transitions.** Between consecutive statuses of one release:
`draft` to `draft` or `published`; `published` to `published`, `yanked` or
`quarantined`; `yanked` to `yanked` or `published`; `quarantined` to
`quarantined` or `yanked`. Nothing returns to `draft`. When sequences were
skipped, the new state must be reachable in at most the sequence gap steps.
Lifting a quarantine therefore takes two signed steps, `quarantined` to
`yanked` to `published`; this is intended, so a quarantined release is never
republished by a single status.

A consumer verifies the manifest first, then checks the received status
document against it, in this order, and fails closed:

1. canonical bytes, else `status.non_canonical`;
2. structure: an unknown member is `unknown_field`, a missing member
   `required`; a `state` outside the list above is `status.unknown_state`,
   even when correctly signed; a bad lifetime is `status.invalid_lifetime`; a
   first status that is not `draft` or `published` is
   `status.invalid_transition`;
3. `releaseDigest` equals the verified manifest's `releaseDigest`, else `status.digest_mismatch`;
4. `manifestDigest` equals the verified manifest's manifest digest, else `status.manifest_mismatch`;
5. `issuedAt` is not before the manifest's `createdAt`, else `status.issued_before_release`;
6. the signature (`signature.unknown_key`, `signature.invalid_key`, `signature.mismatch`);
7. `issuedAt` is at most 300 seconds after `now`, else `status.not_yet_valid`;
   `now` is not after `expiresAt`, else `status.expired`;
8. against the last status it accepted for the same `manifestDigest`: a lower
   `sequence` is `status.rollback`; the same `sequence` with different signed
   bytes is `status.conflict` (identical bytes are accepted); a higher
   `sequence` needs a later `issuedAt` (`status.issued_at_regression`) and an
   allowed transition (`status.invalid_transition`).

Storage: the registry stores and serves the full signed status document as
issued (R2 `statuses/sha256/<hex>.json`, create-only), so `reason` needs no
database column; D1 keeps only the sequence, issue time and R2 key of the
latest document (`status_sequence`, `status_issued_at`, `status_key`), used to
issue the next one.

Cross-language vectors: `packages/contracts/src/fixtures/release-status-v1.json`
(the signed manifest documents with their manifest digests, including one tree
under two versions; each vector names its manifest, the consumer's `now`, the
previously accepted status document and the received document; valid
statuses with their signing payload, including a daily re-sign, a
re-publication, a transition across a skipped sequence, a check exactly at
`expiresAt` and an `issuedAt` exactly 300 seconds ahead of `now`; invalid
documents with their single expected code, covering every `status.*` code,
tampering, wrong and unknown keys, Go escaping, a signature with non-zero
unused base64 bits, non-canonical bytes, a case-variant member, injected empty
or `null` reasons and reason rules). Same public test key as the manifest vectors.

### Database columns (migration `0011_release_tree_digest`)

`package_releases`: `release_digest`, `file_count`, `tree_size`,
`signed_manifest_key` (R2 key of the signed manifest), `quarantined_at`,
`status_sequence` and `status_issued_at` (sequence and issue time of the last
signed status; the state itself stays in `release_state`), and the non-unique
index `idx_package_releases_digest`. `packages.visibility`
(`public` default, `private`). `publishers.state` (`active` default,
`suspended`, `revoked`). All additive; rollback SQL is in the migration header
and ends by deleting the `0011_release_tree_digest.sql` row from
`d1_migrations`, so the migration can be applied again.

### Publishing releases

#### `POST /api/v1/packages/@{publisher}/{slug}/releases`

Uploads one immutable release. Off by default: unless the worker var
`SKILLX_RELEASES_API` is `"1"` or `"true"`, every method answers `404`.
Clients normally call it through `skillx release publish` (or the
`publish-release.yml` workflow), which packs the committed git tree with
`skillx release pack`.

**Auth**: `Authorization: Bearer sx_...`, a scoped API key holding
`releases:publish:@{publisher}` whose user owns the active publisher.
Unscoped keys are rejected (`auth.scope_missing`).

**Request**:

- `Content-Type: application/x-tar`: an uncompressed tar (gzip is rejected).
  At most 32 MiB, 1000 files, 32 MiB per file and in total; the server limits
  are tighter than the `agentkit.skill-tree/v1` client limits and only reject.
  A publish also has a subrequest budget (Worker var
  `SKILLX_RELEASE_SUBREQUEST_BUDGET`, default 5000): one R2 put per distinct
  file plus a fixed 16; a plan above it is refused with `413
  tree.limit_exceeded` before any R2 write.
- `X-SkillX-Release`: base64 of a UTF-8 JSON object, at most 16 KiB:
  `version` (SemVer without build metadata, required), `channel`
  (`stable` default, `beta`, `alpha`), `kind` (`skill` default, `hook-pack`,
  `bundle`), `sourceProvenance` (`{repo, commit, path}` or `null`) and
  `declaredScripts` (packaged paths). Unknown members are rejected.
  `sourceProvenance` is asserted by the publisher and not verified (GitHub
  OIDC is a follow-up); the registry signature covers it but does not vouch
  for it.

**Processing**, each step rejecting before the next runs: name and reserved
namespaces, key and ownership, signing key, metadata, capped body, tar read
with the shared skill-tree rules and digest (traversal, absolute paths,
symlinks, hardlinks, devices and duplicate paths fail), version conflict, the
exec manifest check (below), the release scan, the signed `skillx.release/v1`
manifest, then R2 writes, and the D1 row last. Uploaded bytes are stored
exactly; nothing is sanitized.

**Exec manifest** (`agentkit-exec.json`, optional). A tree may carry an
`agentkit.skill-exec/v1` manifest at its root naming the scripts AgentKit's
script broker may run and the capabilities each requests. SkillX never runs
them; it rejects a malformed manifest at publish with `422` before anything is
signed or stored, and keeps a parsed summary. Rules
(`packages/contracts/src/exec-manifest.ts`, `exec-capabilities.ts`; the shape
follows the AgentKit G3 draft and will be aligned with its conformance
vectors):

- at most 64 KiB of UTF-8 JSON without a BOM; whitespace and member order are
  free, a duplicate member at any depth or an unknown member is invalid;
  `schemaVersion` must be `agentkit.skill-exec/v1`, except that a newer major
  `agentkit.skill-exec/vN` (N > 1) is accepted without validation (below);
- `entrypoints`: 1 to 32 objects with a unique `name`
  (`[a-z0-9][a-z0-9._-]{0,63}`), a `path` that is a file of the tree **and**
  listed in `declaredScripts` (else `exec.entrypoint_undeclared`), an
  `interpreter` `{name: python3 | node | sh, version?: <range>}`, optional
  `args` `{maxCount <= 64, maxBytes <= 65536}`, optional `inputs` (names), and
  `capabilities`;
- `capabilities` (all required): `filesystem.read` (`$PACKAGE`,
  `$INPUT:<declared input>`), `filesystem.write` (`$OUTPUT`, `$TMP`; no host
  paths), `network.hosts` (lowercase DNS names, no IP literal, port or
  wildcard), `subprocess` (boolean), `env` and `secrets` (upper-case names),
  `limits` `{wallSeconds <= 3600, cpuSeconds <= 3600, memoryMiB <= 8192,
  processes <= 256, outputBytes <= 64 MiB}`; lists hold at most 32 unique
  items;
- optional `dependencies`: `{kind: "none"}` (default) or
  `{kind: "python-lock" | "node-lock", lockfile: <tree file>}`.

Requesting network hosts, a subprocess, secrets or locked dependencies is
valid at publish; what is granted is AgentKit's decision. The summary
(`exec_summary_json`, and `exec` in the response) lists per entrypoint its
`name`, `path`, `interpreter`, `capabilityDigest` (sha256 of the canonical JSON
of `{capabilities, interpreter}`), `networkHosts`, `subprocess`, `secrets`
and `write`, plus `dependencies` and the manifest `fileDigest`, with
`validated: true`. The manifest file itself stays the authority; it is
covered by `releaseDigest`.

A newer schema major is stored as `{validated: false, schema, path,
fileDigest}` and the response carries the warning `exec.schema_unvalidated`,
so SkillX never blocks a publish because it lags AgentKit's schema. The file
must still be strict JSON within 64 KiB.

The scan only decides the initial state. Any of these makes the release
`quarantined` instead of `published`:

- a secret pattern in any file, binary included (searched over the raw bytes);
- an instruction document (`.md`, `.markdown`, `.mdx`, `.txt`), script or
  text config (by extension, a `scripts/` directory or a `#!` line) that is
  not NUL-free UTF-8 (`danger:non-utf8-text`), since such bytes would hide
  content from the scan while agents still read the file;
- prompt injection or another `danger` rule of the SKILL.md scanner in an
  instruction document.

Findings are `danger:<rule>:<path>` and never echo the matched text.

**R2 layout** (all create-only via `If-None-Match: *`, with R2 SHA-256
integrity checks): `artifacts/sha256/<hex>.tar` (the upload),
`blobs/sha256/<hex>` (each file, deduplicated) and
`manifests/sha256/<hex>.json` (the signed manifest bytes, keyed by their own
SHA-256, so one tree under two versions never collides).

**Response** `200`:

```json
{
  "identity": "@acme/demo",
  "version": "1.0.0",
  "releaseDigest": "sha256:...",
  "artifactDigest": "sha256:...",
  "state": "published",
  "manifestKey": "manifests/sha256/....json",
  "keyId": "skillx-reg-993cd14a011f7b76",
  "created": true,
  "findings": [],
  "exec": null,
  "warnings": []
}
```

`exec` is the exec manifest summary, or `null` when the tree has no
`agentkit-exec.json`. `warnings` lists non-blocking `{code, message}` notes
(currently only `exec.schema_unvalidated`).

Re-uploading the same tree for an existing version answers `200` with
`created: false` (idempotent retry); different content is `409`. Concurrent
uploads of one version resolve through the unique `(package_id, version)`
index: one row wins and the loser gets the same idempotent `200` or `409`.

**Errors** use `{"error": {"code", "message"}}`:

| Status | Codes |
|--------|-------|
| 400 | `identity.*` (invalid names), `release.invalid_metadata`, `tree.read_failed` (empty body) |
| 401 | `auth.invalid_key` |
| 403 | `identity.reserved_publisher` (`@agentkit`), `identity.reserved_alias` (`ak-`/`ak:` slugs), `auth.scope_missing`, `publisher.not_owner`, `publisher.inactive` |
| 404 | `not_found` (API disabled) |
| 409 | `release.version_exists`, `release.kind_conflict` |
| 413 | `tree.limit_exceeded` |
| 415 | `release.unsupported_media_type` |
| 422 | other `tree.*` codes from the skill-tree reader, `exec.manifest_invalid`, `exec.entrypoint_undeclared` |
| 500 | `release.internal_error` |
| 503 | `release.signing_unavailable` |

**Signing**: the registry countersigns with the Ed25519 key in worker secrets
`SKILLX_REGISTRY_SIGNING_KEY` (base64 PKCS #8 DER) and
`SKILLX_REGISTRY_SIGNING_KEY_ID` (published key id
`skillx-reg-993cd14a011f7b76`). A missing or malformed key fails closed with
`503`; key material is never logged or returned.

### Reading releases (pinned whole-tree read API)

Read-only, behind the same flag: unless `SKILLX_RELEASES_API` is `"1"` or
`"true"`, every endpoint answers `404 not_found`.

| Endpoint | Returns |
|----------|---------|
| `GET /api/v1/packages/@{publisher}/{slug}/releases` | JSON list, newest first (at most 500): `version`, `channel`, `state`, `releaseDigest`, `artifactDigest`, `artifactSize`, `createdAt`. Published and yanked releases; a release is hidden when its tree is quarantined anywhere (it would answer `403`), so the list never offers one |
| `GET /api/v1/packages/@{publisher}/{slug}/releases/{version}` | The signed `skillx.release/v1` manifest bytes (new resolution: only `published`) |
| `GET /api/v1/packages/@{publisher}/{slug}/releases/{version}/status` | The signed `skillx.release-status/v1` document of that release, in every state (see [Signed release status](#signed-release-status)) |
| `GET /api/v1/releases/{releaseDigest}/manifest[?version=&package=]` | The same manifest, by tree digest (locked clients) |
| `GET /api/v1/releases/{releaseDigest}/files/{path}[?version=&package=]` | One file's raw bytes, only if `path` is in the manifest |
| `GET /api/v1/releases/{releaseDigest}/artifact[?version=&package=]` | The uploaded tar, streamed same-origin from R2 (no redirect) |
| `GET /api/v1/keys` | `{"algorithm": "ed25519", "active": [...], "revoked": [...]}` registry key IDs |

**Auth**: optional. `Authorization: Bearer sx_...` with an unscoped API key,
or the web session. Without an `Authorization` header the session decides,
and no session means anonymous. A present header that does not carry a valid
unscoped key (unknown, revoked, malformed, another scheme, or a scoped
publish key, which never authenticates reads) answers `401 invalid_api_key`
with `WWW-Authenticate: Bearer`; it never falls back to the session or to
anonymous. The `Bearer` scheme is matched case-insensitively. Tokens are
never accepted in the query string.

**Access and state rules** (same answer on every endpoint, checked in this
order: unknown or unentitled `404`, then quarantined `403`, then publisher
revoked `403`, then yanked):

- Private package (`packages.visibility = 'private'`): needs an unrevoked
  entitlement of the caller for the package (`release_id` NULL) or the
  release, decided by the shared payload-access gate. Otherwise the answer is
  `404 not_found`, the same body as an unknown package, so existence is not
  disclosed. A release-only entitlement lists only the entitled releases.
  Publishers have no implicit access: they read their own private packages
  through an entitlement, like any other caller.
- Publisher `suspended` or `revoked`: `403 publisher_revoked` (after
  quarantine: a quarantined release of a revoked publisher answers
  `release_quarantined`). The listing has no tree of its own, so it answers
  `publisher_revoked` and hides quarantined releases.
- `quarantined`: `403 release_quarantined` on every endpoint. Quarantine is
  a judgement about the bytes, so it fails closed across the whole tree: if
  any release sharing a `releaseDigest` (in any package) is quarantined,
  every digest endpoint answers `403`, with or without `?version=`, and a
  lookup by version of a published release of that tree is `403` too.
  Unknown or unentitled callers still get `404` first. Yanked stays per
  release.
- `yanked`: `410 release_yanked` by version; by digest it is still served,
  with `X-SkillX-Release-State: yanked`.
- Draft releases and releases without a signed manifest do not exist here.
- One tree may be released under several versions or packages. The digest
  endpoints (`manifest`, `files`, `artifact`) accept optional
  `?version={version}` and `?package=@{publisher}/{slug}` selectors
  (selectors, never credentials). Locked clients should always send both:
  - With `package`, only releases of that package count, so another package
    republishing the same bytes can never answer for it. Another package, or
    one without a release of this tree, answers the same `404 not_found` as an
    unknown release; a malformed identity is `400 identity.invalid`.
    Quarantine still applies to the whole tree.
  - With `version`, exactly that release is resolved; its `releaseDigest`
    must equal the path digest. A mismatched or unknown version answers the
    same `404 not_found` as an unknown release (a malformed one is `400
    invalid_version`). Yanked applies to the selected release alone, so a
    selected yanked version is served with `X-SkillX-Release-State: yanked`;
    quarantine still applies to the whole tree (above).
  - Without `version`, the choice is deterministic: only releases the caller
    may read count, a quarantined tree is `403`, then a published
    release of an active publisher wins over a yanked one, then the earliest
    created. The served manifest may therefore belong to another version of
    the same tree. The lookup reads at most 50 rows of the tree, ordered by
    exactly these rules (readable by the caller, active publisher,
    published, earliest), so only rows that could not win are dropped; the
    quarantine check covers the whole tree regardless of that bound.
  - `X-SkillX-Identity` and `X-SkillX-Version` name the release served.

**Bytes**: stored bytes are served exactly as published, never transformed
(`Cache-Control` carries `no-transform`). The manifest keeps its signed
canonical bytes; its state is in headers (`X-SkillX-Release-State`,
`X-SkillX-Release-Digest`). File and artifact responses are
`application/octet-stream` / `application/x-tar` with `Content-Disposition:
attachment`, `X-Content-Type-Options: nosniff` and a `sandbox` CSP, so a
browser never renders them. A file's `ETag` is its SHA-256 (the manifest
`sha256`), the artifact's is the artifact SHA-256 (also in
`X-SkillX-Artifact-Digest`); a matching `If-None-Match` answers `304`.
`X-SkillX-File-Mode` carries the manifest mode. Files are read from the
per-file blobs `blobs/sha256/<hex>` by the manifest `sha256`; the artifact
from the key recorded in D1.

**Caching**: files and artifacts are digest-addressed and immutable
(`max-age=31536000, immutable`); listings, manifests and keys use
`max-age=60` because state can change. Private packages use `private`,
public ones `public`. Every success except `/keys` carries `Vary:
Authorization, Cookie`, because the selected release can depend on the
caller's entitlements. Every JSON error (including `401`, `429` and the
flag-off `404`) is `Cache-Control: no-store`. A `304` carries the same
`ETag`, `Cache-Control` and `Vary`. Caveat: public file and artifact bytes
cached for a year by a browser or proxy cannot be recalled by a later
quarantine; quarantine only stops new fetches from this API.

**Size caps**: manifests up to 4 MiB, files up to 32 MiB, artifacts up to
32 MiB (the publish limits). A stored object that is missing, over its cap or
of a different size than recorded is never served (`500
release.storage_inconsistent`).

**Rate limit**: 300 requests per 60 seconds per caller (the user ID when
authenticated, else the client IP), through the Workers Rate Limiting binding
`RELEASE_READ_LIMITER` (`ratelimits` in `apps/web/wrangler.jsonc`). The
binding counts per Cloudflare location, so the limit is approximate; it costs
no KV or D1 write. Over the limit: `429 rate_limited` with `Retry-After: 60`
(the binding does not report when its window ends). A missing or failing
binding lets the request through and logs once per isolate. Authenticated API
key reads still record the key's `last_used_at` in D1 on every request (shared
`authenticateApiKey` behaviour).

**Keys**: `active` is `SKILLX_REGISTRY_SIGNING_KEY_ID`; `revoked` is the
optional comma-separated `SKILLX_REGISTRY_REVOKED_KEY_IDS` (a revoked ID is
never listed as active). Set it as a secret:
`wrangler secret put SKILLX_REGISTRY_REVOKED_KEY_IDS --name skillx-web` (or
type "Secret" in the dashboard). Do not use a `wrangler.jsonc` var or a
dashboard plain var: a deploy removes dashboard plain vars missing from the
config, and only secrets survive it. Informational only: clients trust the
public keys they embed. The private key is never read by this endpoint.

**Errors** use `{"error": {"code", "message"}}`:

| Status | Codes |
|--------|-------|
| 400 | `invalid_digest`, `invalid_path` (not one valid tree path after a single percent-decode: NUL, backslash, `..`, empty segment, absolute, bad escape), `invalid_version`, `identity.invalid` |
| 401 | `invalid_api_key` (an `Authorization` header without a valid unscoped key) |
| 403 | `publisher_revoked`, `release_quarantined` |
| 404 | `not_found` (unknown, unentitled, path not in the manifest, or API disabled) |
| 410 | `release_yanked` |
| 429 | `rate_limited` |
| 500 | `release.storage_inconsistent`, `release.internal_error` |

Local smoke test (local bindings only, never remote):
`node scripts/smoke-releases-local.mjs` against a running `pnpm dev` with
`SKILLX_RELEASES_API=1` (see the script header).

### Signed release status

`GET /api/v1/packages/@{publisher}/{slug}/releases/{version}/status` answers
the signed `skillx.release-status/v1` document of that release (contract
above), so a consumer can verify yank and quarantine offline with the
registry public key. Same flag, auth, rate limit and `404` rules as the other
read endpoints; unlike them it answers in every served state (`published`,
`yanked`, `quarantined`, and for a suspended or revoked publisher), because the
signed state is the point. Drafts and unentitled private packages are `404`.

The signed `state` mirrors what the read API enforces:

| Release | Signed `state` | `reason` |
|---------|----------------|----------|
| quarantined | `quarantined` | `quarantined` |
| published or yanked, but another release of the tree is quarantined | `quarantined` | `tree_quarantined` |
| publisher suspended or revoked | `quarantined` | `publisher_revoked` |
| yanked | `yanked` | `yanked` |
| published | `published` | none |

The document is public, so `reason` is only one of these fixed codes. The
free-text `reason` of a state change stays admin-only in `release_state_audit`.

**Issuing**: lazy and monotonic. The latest document is served again while it
reports the current state, reason and active key and is less than 12 hours
old. Otherwise a new one is signed with the registry key: `expiresAt =
issuedAt + 24h`; `issuedAt` is at least 1 second after the previous one and
never before the manifest `createdAt`; `sequence` advances by the number of
transitions needed to reach the new state (at least 1; `quarantined` to
`published` advances by 2, through `yanked`), and a release whose first status
is not `published` starts after an implied `published` sequence 1. The next
sequence is always above the recorded `status_sequence`; when the previous
document is unknown (its R2 object is missing, does not hash to its key, or
the pointer was lost by a 0014 rollback and reapply) it advances by 4, the
verifier's transition cap, so any state stays reachable, and `issuedAt` stays
after the recorded `status_issued_at`. Such a document is re-issued, never an
error. A compare-and-set on `status_sequence` keeps one document per
sequence: a request that loses the race re-reads the release and serves the
recorded document only if it reports the state it now observes, else signs
again; after 3 lost races it answers `503 release.status_contended`. State
changes do not issue documents themselves; the next status request does.

**Response** `200`: the canonical document bytes, `Content-Type:
application/json`, `Cache-Control: <public|private>, max-age=60,
no-transform`, `Vary: Authorization, Cookie`, `ETag` (the document SHA-256),
and `X-SkillX-Release-State` (the signed state), `X-SkillX-Release-Digest`,
`X-SkillX-Identity`, `X-SkillX-Version`. Errors as above, plus `503
release.signing_unavailable` when a new document is needed and the signing
key is missing, and `503 release.status_contended` (retry).

### Database columns (migration `0012_api_key_scopes`)

`api_keys.scopes`: nullable JSON array of scopes; `NULL` keeps existing keys
unscoped. Additive; the header rollback revokes every scoped key, drops the
column and deletes the `0012_api_key_scopes.sql` row from `d1_migrations`.

### Changing release and publisher state

Behind the same flag (`404 not_found` unless `SKILLX_RELEASES_API` is `"1"`
or `"true"`; other methods `405`).

| Endpoint | Who |
|----------|-----|
| `POST /api/v1/packages/@{publisher}/{slug}/releases/{version}/state` | The package owner (owner of its publisher) or an admin |
| `POST /api/v1/publishers/@{handle}/state` | Admin only |

**Request**: `Content-Type: application/json`, at most 4 KiB:
`{"from": "<expected state>", "to": "<new state>", "reason": "<optional>"}`.
Unknown members are rejected. `reason` is 1 to 512 UTF-8 bytes without
control, format (bidi) or line separator characters (the
`skillx.release-status/v1` reason rules). It is stored in the admin-only
audit and never published; the signed status carries a fixed reason code.

**Auth**: admin with `X-Admin-Secret: <ADMIN_SECRET>` (the existing admin
pattern; a present but wrong or unconfigured secret is `401
invalid_admin_secret`, never a fall back). Otherwise the caller is the read
API viewer: `Authorization: Bearer sx_...` with an unscoped account key, or
the web session. Scoped `releases:publish:@handle` keys are publish-only and
answer `401 invalid_api_key`, so a leaked CI publish key cannot yank.

**Rate limit**: writes count against their own binding,
`RELEASE_WRITE_LIMITER`, 30 per 60 seconds per caller. A request carrying
`X-Admin-Secret` is first counted by client IP, before the secret is checked,
so guessing is throttled. Once the actor is known, every request (admin
included, as the single caller `user:admin`) is counted before any state or
audit write.
A limited request answers `429 rate_limited` with `Retry-After` and writes no
audit row. For accounts a missing or failing binding answers
`503 rate_limit_unavailable`; the admin is let through so containment never
depends on it. The limit is counted per Cloudflare location, so it bounds
audit growth per caller without stopping it.

**Compare-and-set**: the change applies only while the row is still in
`from`; otherwise `409 state_conflict` (re-read and retry). Two concurrent
changes from the same state (for example a yank and a quarantine) produce
exactly one winner; the other gets `409`.

**Release transitions**: every applied (audited) edge is an edge of the
signed status graph, so every history can later be issued as
`skillx.release-status/v1` documents:

| From | To | Owner | Admin |
|------|----|-------|-------|
| `draft` | `published` (needs a tree digest and signed manifest, else `422 release.incomplete`) | yes | yes |
| `published` | `yanked` | yes | yes |
| `published` | `quarantined` | no | yes |
| `quarantined` | `yanked` (lifts a quarantine) | no | yes |
| `yanked` | `published` | no | yes |
| `yanked` | `quarantined` (containment composite, below) | no | yes |

Lifting a quarantine is two steps (`quarantined` to `yanked` to `published`),
and nothing returns to `draft`. Any other pair, or `from` equal to `to`, is
`422 transition.invalid`. Checks run in this order for an owner: ownership,
then publisher standing (an owner of a `suspended` or `revoked` publisher
gets `403 publisher_revoked`, whatever the pair), then the pair, then
admin-only edges. The publisher standing is checked again inside the
compare-and-set batch, so a suspension that lands mid-request still refuses
the change (`403 publisher_revoked`, audited `denied`).

**Containing a yanked release**: `yanked` to `quarantined` is not an edge of
the v1 contract graph, but a yanked release is still served by digest to
existing lockfiles, so an admin must be able to contain it. The server applies
the path `yanked` to `published` to `quarantined` in one atomic D1 batch,
under the same compare-and-set on `yanked`, and writes one `applied` audit row
per edge (both, or none; a lost race leaves one `stale` row of the requested
pair). No reader ever sees it `published`; the response reports
`"from": "yanked", "to": "quarantined"`. Owners get `403
transition.admin_only`. A future status issuer must advance the signed
`sequence` by 2 for this change (the v1 rule accepts a state reachable in at
most the sequence gap). Do not reproduce it as two separate requests: between
them the version is installable.

**Several quarantined releases of one tree**: quarantine judges the bytes, so
every read of a tree digest is `403 release_quarantined` while any release
with that digest, in any package, is quarantined. Lifting one of them leaves
the tree blocked until all are lifted.

**Publisher transitions** (admin only): `active` to `suspended`, `suspended`
to `active` (reinstate) or `revoked`; `revoked` is final. A suspended or
revoked publisher's releases answer `403 publisher_revoked` on every read
endpoint and its uploads `403 publisher.inactive`.

**Invariants**: only `release_state` (or `publishers.state`) and the matching
timestamp change (`published_at` keeps the first publication; `yanked_at`
and `quarantined_at` record the last entry). Bytes, digests, R2 objects and
manifests never change, and the version still cannot receive another tree
(`409 release.version_exists` on upload). Nothing is deleted.

**Audit**: every attempt by an authenticated actor on an existing release or
publisher that passes the rate limit writes one `release_state_audit` row
(two for an applied containment composite; actor kind and id, expected
`from`, `to`, outcome `applied`, `stale`, `denied` or `invalid`, reason,
time), in the same D1 batch as the change, so a lost compare-and-set is
recorded too. The admin actor id is `admin` (the shared secret carries no
individual identity). The table is append-only: triggers abort any `UPDATE`
or `DELETE`.

**Signed status**: transitions leave `status_sequence` unchanged; the next
request to the [status endpoint](#signed-release-status) issues a new signed
document for the new state.

**Response** `200` (`Cache-Control: no-store`):

```json
{
  "identity": "@acme/demo",
  "version": "1.0.0",
  "releaseDigest": "sha256:...",
  "from": "published",
  "to": "yanked",
  "state": "yanked",
  "changedAt": "2026-10-13T12:00:00.000Z"
}
```

The publisher route answers `{"handle", "from", "to", "state", "changedAt"}`.

**Errors** (`{"error": {"code", "message"}}`, `no-store`):

| Status | Codes |
|--------|-------|
| 400 | `invalid_request` (body, states, reason), `identity.invalid`, `invalid_version` |
| 401 | `auth.required`, `invalid_api_key`, `invalid_admin_secret` (with `WWW-Authenticate: Bearer`) |
| 403 | `transition.not_owner` (public package), `transition.admin_only`, `publisher_revoked` |
| 404 | `not_found` (unknown release or publisher; a private package of another owner; API disabled) |
| 409 | `state_conflict` |
| 413 | `request_too_large` |
| 415 | `unsupported_media_type` |
| 422 | `transition.invalid`, `release.incomplete` |
| 429 | `rate_limited` (with `Retry-After`) |
| 500 | `release.internal_error` |

### Provisioning a publisher

`POST /api/v1/publishers` (admin only) creates an `active` publisher, the
prerequisite of scoped key creation and of every upload. Same flag (`404
not_found` while off; other methods `405 method_not_allowed`), same admin
secret check and same `RELEASE_WRITE_LIMITER` counting as a state change
(client IP first, then `user:admin`, before the body is read). Without
`X-Admin-Secret` an account (unscoped key or session) is `403
publisher.admin_only`; no credentials at all is `401 auth.required`.

**Request**: `Content-Type: application/json`, at most 4 KiB:

```json
{ "handle": "acme", "ownerUserId": "<user.id>", "verifiedBy": "admin", "reason": "<optional>" }
```

- `handle`: the bare lowercase handle, without `@`
  (`[a-z0-9][a-z0-9._-]{0,63}`), as stored in `publishers.handle`. The display
  name is set to the handle.
- `ownerUserId`: the `id` of an existing row of the `user` table; an unknown
  id is `404 user.not_found`.
- `verifiedBy`: optional, and only `admin` (the default) is accepted. The
  `publishers` table has no verification column, and every signed release
  manifest records `verifiedBy: "admin"`.
- `reason`: optional, the state change reason rules; stored on the audit row.
- Any other member is `400 invalid_request`.

**Response** `200` (`Cache-Control: no-store`):

```json
{ "handle": "acme", "ownerUserId": "<user.id>", "verifiedBy": "admin", "state": "active", "created": true }
```

Idempotent and race safe (`INSERT ... ON CONFLICT(handle) DO NOTHING`, then a
read back). Replaying the same handle and owner answers `200` with
`"created": false` and the publisher's stored `state` (a suspended publisher
stays suspended), and writes nothing. The same handle with another owner is
`409 publisher.conflict`. A creation writes one `release_state_audit` row in
the same batch: `subject_kind` `publisher`, actor `admin`, `from_state`
`none`, `to_state` `active`, outcome `applied`.

**Errors**: `400 invalid_request`, `401 auth.required` / `invalid_api_key` /
`invalid_admin_secret`, `403 publisher.admin_only`, `404 not_found` (API
disabled) / `user.not_found`, `409 publisher.conflict`, `413
request_too_large`, `415 unsupported_media_type`, `429 rate_limited`, `500
release.internal_error`, `503 rate_limit_unavailable` (an account request
while the write limiter is missing or failing).

### Database table (migration `0013_release_state_audit`)

`release_state_audit`: `id`, `subject_kind` (`release` or `publisher`),
`subject_id`, `actor_kind` (`admin` or `user`), `actor_id`, `from_state`
(`none` for a publisher creation), `to_state`, `outcome`, `reason`,
`created_at`, index
`idx_release_state_audit_subject`, and triggers
`release_state_audit_no_update` / `release_state_audit_no_delete`. No foreign
keys, so the history outlives its subject. Additive; the header rollback drops
the triggers, index and table and deletes the `0013_release_state_audit.sql`
row from `d1_migrations`.

### Database columns (migration `0014_release_status_and_exec`)

`package_releases.status_key` (R2 key of the latest signed status document)
and `package_releases.exec_summary_json` (the exec manifest summary, `NULL`
without `agentkit-exec.json`). Both nullable and additive; the header rollback
drops them and deletes the `0014_release_status_and_exec.sql` row from
`d1_migrations`.

---

## Error Format

All error responses follow a consistent shape:

```json
{
  "error": "Human-readable error message",
  "details": "Optional technical details (500 errors only)"
}
```

## Rate Limits

No explicit rate limiting at the API layer, except the release read API (300 requests per minute per caller) and the release state API (30 per minute per caller), both `429` with `Retry-After`; see [Reading releases](#reading-releases-pinned-whole-tree-read-api)). Cloudflare Workers handles DDoS protection. Search results cached in KV (5min TTL) for performance.

## Source Files

| File | Purpose |
|------|---------|
| `apps/web/app/routes/api.search.ts` | Hybrid search (GET + POST) |
| `apps/web/app/routes/api.skill-detail.ts` | Skill detail with reviews |
| `apps/web/app/routes/api.skill-rate.ts` | Rate a skill |
| `apps/web/app/routes/api.skill-review.ts` | List/create reviews |
| `apps/web/app/routes/api.skill-favorite.ts` | Toggle favorite |
| `apps/web/app/routes/api.usage-report.ts` | Report usage outcome |
| `apps/web/app/routes/api.leaderboard.ts` | Paginated leaderboard |
| `apps/web/app/routes/api.user-api-keys.ts` | API key management |
| `apps/web/app/routes/api.v1.release-publish.ts` | Release publish (flagged) |
| `apps/web/app/routes/api.v1.package-releases.ts` | Release listing (GET) and publish (POST, action re-exported) on one path |
| `apps/web/app/routes/api.v1.release-{manifest,file,artifact}.ts` | Pinned release reads (flagged) |
| `apps/web/app/routes/api.v1.release-status.ts` | Signed release status document (flagged) |
| `apps/web/app/routes/api.v1.signing-keys.ts` | Registry key IDs (flagged) |
| `apps/web/app/routes/api.v1.release-state.ts` | Release and publisher state transitions (flagged) |
| `apps/web/app/lib/releases/` | Release ingest, signing, scan, R2 and D1 writes; read access, rate limit and read handlers; state transitions (`release-transitions.ts`, `release-state-http.ts`) |
| `apps/web/app/routes/api.admin.seed.ts` | Admin data seeding |
| `apps/web/app/routes/auth-catchall.tsx` | Better Auth handler |
