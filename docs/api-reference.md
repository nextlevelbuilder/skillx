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
      "created_at": 1707868800000
    }
  ]
}
```

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

**Response** `200`:

```json
{
  "success": true,
  "key": "sx_a1b2c3d4e5f6...",
  "message": "Save this key securely. It will not be shown again."
}
```

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
`agentkit.skill-tree/v1` tree of its files. It is a JSON object with exactly
these members; unknown members are rejected at every level.

| Member | Type | Rule |
|--------|------|------|
| `schemaVersion` | string | `skillx.release/v1` |
| `identity` | string | `PACKAGE_NAME_PATTERN`, publisher and slug pass the tree segment rules; `@agentkit/*` is rejected (`identity.reserved_publisher`) |
| `version` | string | semantic version |
| `channel` | string | `stable`, `beta`, `alpha` |
| `kind` | string | `skill`, `hook-pack`, `bundle` |
| `releaseDigest` | string | `sha256:<64 lowercase hex>`; equals the tree digest of `files` and is the release identity |
| `artifactDigest` | string | `sha256:<64 lowercase hex>` of the transport archive; integrity only, never an identity |
| `artifactSize` | integer | positive |
| `files` | array | non-empty, at most 4096 entries of `{ path, mode, sha256, size }`, sorted by raw UTF-8 path bytes, no duplicates or case-fold collisions; `path` passes the tree path, NFC and noise rules; `mode` is `100644` or `100755`; `sha256` is bare lowercase hex; `size` at most 32 MiB |
| `fileCount` | integer | equals `files.length` |
| `treeSize` | integer | sum of file sizes, at most 256 MiB |
| `state` | string | `draft`, `quarantined`, `published`, `yanked` at signing time; a state change produces a newly signed manifest for the same `releaseDigest` |
| `publisher` | object | `{ handle, verifiedBy }`; `handle` equals the identity publisher; `verifiedBy` is `none`, `github` or `admin` (`none` means not publisher-verified) |
| `sourceProvenance` | object or `null` | `{ repo, commit, path }`: https URL without credentials, full lowercase hex commit, package root path (`""` for the repository root) |
| `declaredScripts` | array | paths from `files`, unique and sorted like `files`; informational, never executed by SkillX |
| `createdAt` | string | RFC 3339 UTC with whole seconds, e.g. `2026-10-13T04:30:00Z` |
| `keyId` | string | `^[a-z0-9][a-z0-9._-]{1,63}$` |
| `signatureAlgorithm` | string | `ed25519` |
| `signature` | string | padded standard base64 of the 64-byte Ed25519 signature |

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

Cross-language vectors: `packages/contracts/src/fixtures/release-manifest-v1.json`
(signed valid manifests with their exact signing payload and file contents,
invalid-signature cases, invalid-manifest cases). The vector key is derived
from a public seed text and must never be trusted outside tests.

### Database columns (migration `0011_release_tree_digest`)

`package_releases`: `release_digest`, `file_count`, `tree_size`,
`signed_manifest_key` (R2 key of the signed manifest), `quarantined_at`, and the
non-unique index `idx_package_releases_digest`. `packages.visibility`
(`public` default, `private`). `publishers.state` (`active` default,
`suspended`, `revoked`). All additive; rollback SQL is in the migration header.

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

No explicit rate limiting at the API layer. Cloudflare Workers handles DDoS protection. Search results cached in KV (5min TTL) for performance.

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
| `apps/web/app/routes/api.admin.seed.ts` | Admin data seeding |
| `apps/web/app/routes/auth-catchall.tsx` | Better Auth handler |
