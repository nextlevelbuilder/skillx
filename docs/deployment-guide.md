# SkillX Deployment Guide

## Prerequisites

- **Cloudflare account** (free tier supported)
- **Node.js** >=18 and pnpm
- **wrangler CLI**: `npm install -g wrangler`
- **Git** for version control

## Environment Setup

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-org/skillx.git
cd skillx
pnpm install
```

### 2. Cloudflare Authentication

```bash
# Login to Cloudflare
wrangler login

# Verify authentication
wrangler whoami
```

### 3. Environment Variables

Create `.dev.vars` in `apps/web/`:

```bash
# .dev.vars (development)
BETTER_AUTH_SECRET=your_secret_here
BETTER_AUTH_URL=http://localhost:5173
GITHUB_CLIENT_ID=your_github_oauth_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_client_secret
ENVIRONMENT=development
```

For production, use Cloudflare Secrets. `wrangler.jsonc` declares no named
environments: the production worker is `skillx-web` itself, so wrangler
commands below target it by name (`--name skillx-web`) or, for D1, with
`--remote`. Never pass `--env`/`--environment`; that targets a separate
`skillx-web-production` worker.

```bash
# Set secrets on production Worker
wrangler secret put BETTER_AUTH_SECRET --name skillx-web
wrangler secret put GITHUB_CLIENT_ID --name skillx-web
wrangler secret put GITHUB_CLIENT_SECRET --name skillx-web
```

## Local Development

### Start Development Server

```bash
cd apps/web
pnpm dev
```

Runs on `http://localhost:5173` with:
- React Router SSR hot reload
- Local D1 database (auto-created)
- Local Vectorize fallback (FTS5 only)
- Local KV cache

### GitHub OAuth for Development

1. Go to https://github.com/settings/developers
2. Create OAuth App
3. Authorization callback URL: `http://localhost:5173/auth/callback`
4. Copy Client ID & Secret to `.dev.vars`

### Seed Demo Data

```bash
curl -X POST http://localhost:5173/api/admin/seed
```

Returns: `{ "skills_seeded": 30 }`

### Run Tests

```bash
pnpm test
```

---

## Production Deployment

### Phase 1: Cloudflare Setup

#### Create D1 Database

```bash
# Create production database
wrangler d1 create skillx-db

# Returns:
# [[d1_databases]]
# binding = "DB"
# database_name = "skillx-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Copy database_id to wrangler.jsonc
```

Update `apps/web/wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "skillx-db",
      "database_id": "YOUR_PROD_DATABASE_ID",
      "migrations_dir": "drizzle/migrations"
    }
  ]
}
```

#### Create KV Namespace

```bash
# Create production KV
wrangler kv:namespace create skillx-cache

# Returns:
# [[kv_namespaces]]
# binding = "KV"
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Copy to wrangler.jsonc
```

#### Create Vectorize Index

```bash
# Create production Vectorize
wrangler vectorize create skillx-skills

# Add to wrangler.jsonc:
# [[vectorize]]
# binding = "VECTORIZE"
# index_name = "skillx-skills"
```

#### Create R2 Bucket

```bash
# Create R2 bucket
wrangler r2 bucket create skillx-assets

# Add to wrangler.jsonc:
# [[r2_buckets]]
# binding = "R2"
# bucket_name = "skillx-assets"
```

### Phase 2: Database Setup

#### Run Migrations

```bash
# Apply all migrations to production D1
wrangler d1 migrations apply skillx-db --remote

# Verify
wrangler d1 execute skillx-db --remote --command "SELECT COUNT(*) FROM skills"
```

#### `skills.compatibility_json` (migration `0010_greedy_famine.sql`)

The nullable `skills.compatibility_json` column (a listing's publisher-declared
runtime map, read by `/api/mcp`, `/skills/<slug>.md`, `/llms*.txt` and the
`compatible` search filter) is created by `drizzle/migrations/0010_greedy_famine.sql`.
The file sorts between `0009` and `0010_sour_runaways` but is the newest entry
(`idx` 17) in `meta/_journal.json`; it depends only on `0000`.

The name is deliberate. Production D1 already has the column and already records
`0010_greedy_famine.sql` in `d1_migrations` (applied 2026-09-22 from an earlier
branch). `wrangler d1 migrations apply` decides what is pending by file name, so:

- production: nothing to apply and no manual step; `migrations list --remote`
  shows no pending entry for it. Do not rename the file — a new name would be
  re-applied and fail with `duplicate column name: compatibility_json`;
- a fresh or local database applies it with the rest of the chain.

Check before a deploy that relies on it (read-only):

```bash
wrangler d1 execute skillx-db --remote --command "PRAGMA table_info(skills)"
wrangler d1 migrations list skillx-db --remote
```

Nothing writes the column yet; it is `NULL` (compatibility `unknown`) until a
publisher write path exists.

#### Seed Production Data

```bash
# Get production Worker URL
WORKER_URL=$(wrangler deployments list --name skillx-web | grep -oP 'https://[^ ]+')

# Seed skills
curl -X POST $WORKER_URL/api/admin/seed

# Verify
curl $WORKER_URL/api/search?query=vercel
```

### Phase 3: Secrets Configuration

```bash
# Set authentication secrets
wrangler secret put BETTER_AUTH_SECRET --name skillx-web
# Enter secret value (e.g., 64 random hex chars)

# Set GitHub OAuth credentials
wrangler secret put GITHUB_CLIENT_ID --name skillx-web
wrangler secret put GITHUB_CLIENT_SECRET --name skillx-web

# Verify secrets are set
wrangler secret list --name skillx-web
```

#### Release publishing (off by default)

The release publish API (`POST /api/v1/packages/@publisher/slug/releases`,
see [API reference](./api-reference.md#publishing-releases)) answers `404`
until the `SKILLX_RELEASES_API` var in `apps/web/wrangler.jsonc` is `"1"`.

**Before deploying any build that contains it, whatever the flag:** apply
migration `0012_api_key_scopes` (adds nullable `api_keys.scopes`) to the
production D1. Production is deployed manually and the deploy script does not
migrate (`deploy` is `build && wrangler deploy`), so run this first:

```bash
cd apps/web
pnpm run db:migrate:remote   # applies 0012 to the remote D1
pnpm run deploy              # only after the migration succeeded
```

The legacy API-key routes (`authenticateRequest`, skill install, usage
report) never read `scopes`, so CLI auth keeps working even if this order
is missed, but the API keys page and the release API need the column.

Before enabling the flag:

1. Confirm migration 0012 is applied (above).
2. Set the registry signing secrets. The key is an Ed25519 private key as
   base64 PKCS #8 DER; its id must match the published registry key
   (`skillx-reg-993cd14a011f7b76`). Paste values at the prompt; never put the
   key in a file under the repo, a command line or logs.
   `wrangler.jsonc` declares no named environments, so the production worker is
   `skillx-web` itself; do not pass `--env`/`--environment` (that targets a
   separate `skillx-web-production` worker). Both secrets are already set on
   `skillx-web` as of 2026-10-13.
   ```bash
   wrangler secret put SKILLX_REGISTRY_SIGNING_KEY --name skillx-web
   wrangler secret put SKILLX_REGISTRY_SIGNING_KEY_ID --name skillx-web
   ```
   Without them every upload fails closed with `503 release.signing_unavailable`.
3. Publishers create a key with `POST /api/user/api-keys` and
   `{"scopes": ["releases:publish:@handle"]}` and store it as the
   `SKILLX_PUBLISH_KEY` secret of the `skillx-publish` environment used by
   `.github/workflows/publish-release.yml`.

**Subrequest budget.** Every D1 query and R2 call of a publish counts as a
subrequest; one publish costs one R2 put per distinct file plus a fixed ~16.
The `skillx-web` worker runs on **Workers Paid** (verified 2026-10-13 from
request volume: 250k-415k requests/day, above the free plan's 100k/day cap),
which allows 10,000 subrequests per request by default. The var
`SKILLX_RELEASE_SUBREQUEST_BUDGET` (default `"5000"`, half of that) caps a
publish; a larger plan is refused with `413 tree.limit_exceeded` before any
R2 write. If the worker ever moves to a free account (1,000 cap), lower the
var to about `600`; uploads above roughly 580 distinct files are then refused.

**Rollback, in this order:**

1. Set `SKILLX_RELEASES_API` back to `"0"` and redeploy (the release API
   answers 404 again).
2. Revoke every scoped key before reverting or redeploying older code:
   ```sql
   UPDATE api_keys SET revoked_at = CAST(strftime('%s','now') AS INTEGER) * 1000
    WHERE scopes IS NOT NULL AND revoked_at IS NULL;
   ```
   Scoped keys are stored under a domain-separated hash, so even code that
   predates scopes cannot authenticate them as full-account keys; revoking
   them first is still the required step, since their only purpose is gone.
3. Revert the code and redeploy.
4. Optionally run the rest of the rollback SQL in the header of
   `0012_api_key_scopes.sql` (drops the column, clears `d1_migrations`).

Stored R2 objects and release rows are immutable and stay in place.

#### Registry publishing additions (migration 0018)

Idempotent publish, promote, quarantine review, signed download URLs and
GitHub OIDC trusted publishing live under the release API. Production has had
`SKILLX_RELEASES_API` set to `"1"` since #70, so these routes are **live as
soon as the worker deploys**; no other flag holds them back.

1. **Apply migration `0018_registry_publishing` to the remote D1 before
   deploying. This is mandatory**: publish with an `Idempotency-Key`, the OIDC
   exchange, trusted publishers and quarantine review read and write these
   tables, so a worker deployed first answers `500` on them. The migration is
   additive (four new tables, their indexes and triggers; no existing table
   changes; rollback SQL is in the migration header):
   ```bash
   cd apps/web
   pnpm run db:migrate:remote
   ```
2. Set the token secret (at least 32 characters, random; paste at the prompt).
   It signs OIDC publish tokens (`sxo_`, 15 min) and artifact download tokens
   (5 min), domain-separated by purpose. It gates only those two features:
   without it the OIDC exchange answers `503 oidc.unavailable` and signed
   download URLs `503`; publishing with API keys, idempotency, promote and
   quarantine review work without it.
   ```bash
   wrangler secret put SKILLX_TOKEN_SECRET --name skillx-web
   ```
   Optional var `SKILLX_OIDC_AUDIENCE` (default `skillx`) must match the
   audience the CLI requests (`--oidc-audience`).
3. Register the trusted publisher for the AgentKit foundation workflow (admin
   secret; the repository id comes from `gh api repos/nextlevelbuilder/skillx --jq .id`):
   ```bash
   curl -X POST https://skillx.sh/api/v1/publishers/bestagentkits/trusted-publishers \
     -H "X-Admin-Secret: $ADMIN_SECRET" -H 'Content-Type: application/json' \
     -d '{"repository":"nextlevelbuilder/skillx","repositoryId":"<id>",
          "workflowPath":".github/workflows/publish-agentkit-foundation.yml",
          "ref":"refs/heads/main","environment":"skillx-publish"}'
   ```
4. Protect the `skillx-publish` GitHub environment (repository Settings →
   Environments): deployment branches limited to `main`, and required
   reviewers, so a maintainer approves every run. The workflow builds the CLI
   in a job without `id-token` or the environment, and installs the packed
   CLI in the publish job with lifecycle scripts disabled.
5. GitHub secrets of the `skillx-publish` environment used by
   `.github/workflows/publish-agentkit-foundation.yml`:
   `SKILLX_AGENTKIT_PUBLISH_KEY` (fallback key scoped to
   `releases:publish:@bestagentkits`) and, while `bestagentkits/agentkit` is
   private, `AGENTKIT_READ_TOKEN` (read-only contents).
6. Naming of AgentKit foundation releases: the kit skill directory
   `kits/<kit>/skills/ak-<x>` is published as `@bestagentkits/<x>` (the `ak-`
   prefix is dropped), at the `version` of `kits/<kit>/kit.yaml`; the workflow
   refuses a different version. `@agentkit/*` and `ak-`/`ak:` slugs stay
   reserved (`403 identity.reserved_publisher` / `identity.reserved_alias`):
   the signed `skillx.release/v1` manifest cannot carry kit provenance, and
   AgentKit refuses SkillX releases under `@agentkit`. AgentKit references
   these releases as `skillx:bestagentkits/<x>`. The release is the skill
   directory byte for byte, so its `releaseDigest` equals the
   `agentkit.skill-tree/v1` digest AgentKit computes for that directory.
7. Deploy order for publish visibility: deploy the web app (`skillx-web`)
   with visibility support before dispatching the foundation workflow, which
   publishes with `--visibility public`. An older registry rejects the
   unknown metadata member with `400 release.invalid_metadata` before any
   write or idempotency record, so the run fails closed and can be re-run
   after the deploy. Do not deploy a registry with visibility support while
   the foundation workflow on `main` still lacks `--visibility public`: a new
   `@bestagentkits/*` package would then be created private and anonymous
   AgentKit reads of it would answer `404`.

Rollback: revoke trusted publishers (`POST .../trusted-publishers/{id}/revoke`),
unset `SKILLX_TOKEN_SECRET` (all outstanding `sxo_` and download tokens stop
verifying), then follow the rollback above.

#### Release API activation runbook

Run this supervised, by a maintainer, in order. Stop at the first failure.

1. **Back up D1.** Record a Time Travel bookmark (and optionally export a dump):
   ```bash
   cd apps/web
   wrangler d1 time-travel info skillx-db          # note the bookmark
   wrangler d1 export skillx-db --remote --output=backup-$(date +%Y%m%d%H%M).sql
   ```
   Keep the dump outside the repository; it contains user data.
2. **Apply migrations 0012 and 0013 remotely.** `0012_api_key_scopes` adds
   `api_keys.scopes`; `0013_release_state_audit` adds the append-only
   `release_state_audit` table and its two triggers. Both are additive.
   ```bash
   pnpm run db:migrate:remote
   wrangler d1 execute skillx-db --remote \
     --command "SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 2"
   ```
   Confirm both names are listed.
3. **Deploy** with the flag still `"0"`: `pnpm run deploy`. Check that
   `GET /api/v1/packages/@agentkit/x/releases` answers `404`.
4. **Enable.** Set `SKILLX_RELEASES_API` to `"1"` in `apps/web/wrangler.jsonc`
   and deploy again.
5. **Provision the smoke publisher.** No publisher exists until an admin
   creates one, and scoped key creation and uploads both require an active
   publisher owned by the key owner. Find the owner's user id (the Better Auth
   table is `user`):
   ```bash
   wrangler d1 execute skillx-db --remote \
     --command "SELECT id FROM \"user\" WHERE email = 'owner@example.com'"
   ```
   Then, with the admin secret exported in your shell as `ADMIN_SECRET` (never
   paste it into a file or a ticket):
   ```bash
   curl -sS -w '\n%{http_code}\n' -X POST https://skillx.sh/api/v1/publishers \
     -H "X-Admin-Secret: $ADMIN_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"handle":"<handle>","ownerUserId":"<user id>","reason":"activation smoke"}'
   ```
   Expect `200` with `"state": "active"` and `"created": true`; a replay
   answers `"created": false`, and `409 publisher.conflict` means the handle
   already belongs to another user. `handle` is lowercase without `@`. The
   owner can now create a `releases:publish:@<handle>` key in Settings.
6. **Supervised smoke** with a throwaway skill of a test publisher:
   - publish one release through `publish-release.yml` (or `skillx release`
     with a scoped key) and expect `200` with `"created": true` and the
     signed manifest (a replay of the same tree answers `200` with
     `"created": false`);
   - list, fetch the manifest, one file and the artifact; recompute the tree
     digest locally and compare it with `releaseDigest`;
   - yank it with the owner's account key
     (`POST .../releases/<version>/state`,
     `{"from":"published","to":"yanked","reason":"activation smoke"}`), then
     replay the same body and expect `409 state_conflict`;
   - confirm the audit rows:
     `SELECT outcome, from_state, to_state FROM release_state_audit ORDER BY created_at DESC, rowid DESC LIMIT 5`.
   The smoke release stays yanked; nothing is deleted.

**Containing a yanked release** (for example malware found after a yank;
a yanked release is still served by digest to existing lockfiles): as admin,
send `{"from":"yanked","to":"quarantined","reason":"..."}` to
`POST .../releases/<version>/state` with `X-Admin-Secret`. The server applies
`yanked -> published -> quarantined` in one D1 batch and writes two `applied`
audit rows, so the release is never resolvable as `published` in between. Do
not run the two steps as separate requests: between them the version is
installable. Quarantine judges the bytes: if several releases (in any package)
share a quarantined tree digest, every read of that tree stays
`403 release_quarantined` until each of those releases is lifted.

**Rate limit.** The state endpoint has its own binding,
`RELEASE_WRITE_LIMITER` (`ratelimits` in `wrangler.jsonc`, 30 per 60 s per
caller, namespace `5402`), separate from the read limiter. A request carrying
`X-Admin-Secret` is first counted by client IP, so secret guessing is
throttled; every actor is then counted (the admin as `user:admin`) before any
state or audit write. A limited request answers `429 rate_limited` with
`Retry-After` and writes no audit row. For accounts the limiter fails closed:
a missing or failing binding answers `503 rate_limit_unavailable`, so during
such an outage an owner who must yank asks an admin. The admin is let through
so containment never depends on the binding. All operators share the single
`user:admin` bucket, so bulk containment runs at most 30 transitions per
minute per Cloudflare location: pace a large incident and retry on `429`
after `Retry-After`. Check the binding is listed in the `wrangler deploy`
output before enabling the flag.

**Rollback of 0013**: disable the flag and redeploy first (the state endpoint
then answers 404), then run the rollback SQL in the header of
`0013_release_state_audit.sql` (drops the triggers, index and table, clears
the `d1_migrations` row). Dropping the table discards the audit trail; export
it first. Restore from the Time Travel bookmark only when data, not only
schema, must be reverted.

**Migration 0014 (signed status and exec summary).**
`0014_release_status_and_exec` adds two nullable `package_releases` columns,
`status_key` and `exec_summary_json`; it is additive and must be applied
(`pnpm run db:migrate:remote`, after the backup in step 1) before deploying
code that serves `GET .../releases/<version>/status` or validates
`agentkit-exec.json`, because the publish insert writes `exec_summary_json`.
After deploy, smoke: `curl -sS https://skillx.sh/api/v1/packages/@<handle>/<slug>/releases/<version>/status`
answers a signed document (`"schemaVersion":"skillx.release-status/v1"`) whose
`keyId` is the active key. The first request per release signs and stores one
document in R2 under `statuses/sha256/`. Rollback: the header SQL of
`0014_release_status_and_exec.sql` (drops both columns, clears the
`d1_migrations` row); deploy the previous code first.

**Personal kits API.** `/api/v1/kits/...` needs migrations 0015 and 0016
(personal kit tables and proposals) plus the release read stack
(`SKILLX_RELEASES_API`). Production runs with `SKILLX_PERSONAL_KITS_API` set to
`"1"` in `apps/web/wrangler.jsonc`. Until the Worker var
`SKILLX_SHARED_SKILL_ALIASES` lists at least one identity, every in-place
overlay of an `@agentkit/*` skill answers `422 overlay.shared_alias` (see the
[personal kits API](./personal-kits-api.md)). Before enabling it on another deployment,
confirm that `wrangler d1 migrations list skillx-db --remote` reports nothing
pending. Rollback: set the flag to `"0"` and redeploy; every route answers 404
`kit.api_disabled` and stored kits stay untouched.

**Before the first production `@agentkit` kit release.** Set the Worker var
`SKILLX_SHARED_SKILL_ALIASES` (comma or whitespace separated identities) to
AgentKit's shared-skill list first: the non-`ak-` skills that `kits/core` or
more than one official kit ships (for example `@agentkit/plan`). Kit releases
are published without the `ak-` prefix (`@agentkit/plan`; `@agentkit/ak-*` is
`400 identity.invalid`). While the variable holds no valid identity, the
guard fails closed and refuses every in-place overlay of an `@agentkit/*`
skill, including single-kit skills that may legitimately be overlaid
([personal kits API](./personal-kits-api.md)); setting the list is what
unblocks those. Use identities, not bare aliases: an entry such as `plan` is
ignored. Confirm with an overlay of a listed identity, which must answer
`422 overlay.shared_alias` without naming the variable in its detail. Kit releases also need skillx-sh 0.7.0 or
later on the client: 0.6.0 and earlier report `skillx.release/v2` manifests as
failed verification, so say so in the release notes of the first kit release.

**Migration 0019 and the collections API.**
`0019_collection_revision_lineage` adds two nullable columns
(`collection_revisions.revision_digest`, `collections.cloned_from_revision_id`)
and the `collection_revisions_immutable` trigger, which aborts every `UPDATE`
of a stored revision. It is additive; apply it (`pnpm run db:migrate:remote`,
after a backup) before deploying code with `SKILLX_COLLECTIONS_API` set to
`"1"`. Production runs with the flag `"1"` in `apps/web/wrangler.jsonc`;
with `"0"`, `/api/v1/collections` answers 404. Revisions written before 0019 have no digest;
the CLI then trusts the member list it recomputes. Rollback: set the flag back
to `"0"`, redeploy, then run the header SQL of
`0019_collection_revision_lineage.sql` (drops the trigger and both columns,
clears the `d1_migrations` row).

**Migration 0020 and collection moderation.** `0020_collection_moderation`
adds `collections.moderation_state` (`NOT NULL DEFAULT 'active'`) and the
nullable `moderation_reason` and `moderated_at`. It is additive and either
deploy order works: the collection code reads a missing `moderation_state` as
`active`, and only the admin route `/api/v1/collections/:id/moderation` needs
the columns (it answers 500 until the migration is applied). Apply it with
`pnpm run db:migrate:remote` after a backup. Hide a collection with:

```bash
curl -X POST "https://skillx.sh/api/v1/collections/$ID/moderation" \
  -H "X-Admin-Secret: $ADMIN_SECRET" -H 'Content-Type: application/json' \
  -d '{"from":"active","to":"hidden","reason":"spam"}'
```

The per-account collection cap defaults to 100; set the var
`SKILLX_COLLECTIONS_MAX_PER_USER` to change it. Rollback: deploy the previous
code, then run the header SQL of `0020_collection_moderation.sql`. Code before
0020 ignores `moderation_state`, so a rollback un-hides content: first run
`UPDATE collections SET visibility = 'private' WHERE moderation_state = 'hidden'`.

**Migration 0021 and AgentKit identity.** `0021_agentkit_links` creates the
new table `agentkit_links` (one row per linked account) and touches no existing
data. Apply it with `pnpm run db:migrate:remote` after a backup, before
setting `SKILLX_AGENTKIT_IDENTITY` to `"1"` in `apps/web/wrangler.jsonc`.
Production keeps the flag `"0"` until the agentkit.best authorization server
serves `/.well-known/jwks.json`, `/oauth/token` and `/oauth/revoke` and accepts
the client ID `https://skillx.sh/oauth/client.json`. `AGENTKIT_ISSUER`
(default `https://agentkit.best`) points at another AS for staging. The link
refresh token is encrypted with a key derived from `BETTER_AUTH_SECRET`;
rotating that secret makes stored links unreadable, so each user must link
again. Rollback: set the flag to `"0"` and redeploy (bearer tokens are ignored,
link routes answer 404, unlink still works); to remove the table, run the
header SQL of `0021_agentkit_links.sql`.

**Migration 0022 and the creator dashboard.** `0022_creator_dashboard` adds
the nullable `packages.deleted_at` and `personal_kits.deleted_at` (NULL: not
deleted, so every existing row reads as before) and the new append-only
`package_audit` table with `idx_package_audit_subject` and two triggers that
abort any `UPDATE` or `DELETE` on it. It is additive, but the order matters:
the new code reads `deleted_at` on every release, library and kit query, so
apply it with `pnpm run db:migrate:remote` after a backup and before
deploying the code. Code before 0022 runs fine on the migrated schema. No flag
changes: `/dashboard` needs a session, its package section and the
`/api/v1/packages/.../visibility|delete|restore` endpoints follow
`SKILLX_RELEASES_API`, and its kit section and the kit `delete|restore`
endpoints also follow `SKILLX_PERSONAL_KITS_API`. Publishers need
skillx-sh with `unlisted` support to publish `--visibility unlisted`; older
CLIs refuse the value locally, and an owner can switch a package to unlisted
in the dashboard instead. Rollback: deploy the previous code, then run the
header SQL of `0022_creator_dashboard.sql`. Code before 0022 ignores
`deleted_at`, so a rollback un-deletes content: first run the two `UPDATE ...
SET visibility = 'private' WHERE deleted_at IS NOT NULL` statements in that
header. It treats `unlisted` as private, which fails closed.

The CLI installer (`skillx install`, `sync --locked`, `mcp`) needs no server
change beyond the release read API, but it verifies manifest signatures
against keys the user trusts (see [CLI reference](./cli-reference.md#trusted-signing-keys)).
Until the production signing public key is published, users must add it to
`~/.skillx/trusted-keys.json` or `SKILLX_TRUSTED_KEYS`; the CLI fails closed
otherwise.

### Phase 4: Domain & SSL Setup

```bash
# Add custom domain to Worker
wrangler routes create skillx.sh --pattern skillx.sh/*

# Verify DNS
nslookup skillx.sh

# SSL certificate auto-provisioned by Cloudflare
```

Update GitHub OAuth redirect URI:
- Go to GitHub Settings → Developer apps
- Authorization callback URL: `https://skillx.sh/auth/callback`

### Phase 5: Deployment

```bash
cd apps/web

# Build for production
pnpm build

# Deploy Worker
wrangler deploy --name skillx-web

# Output shows:
# Deployed to https://skillx.sh

# Verify deployment
curl https://skillx.sh
```

### Phase 6: Verification

```bash
# Check Worker status
wrangler deployments list --name skillx-web

# Test search endpoint
curl https://skillx.sh/api/search?query=test

# Test auth flow
open https://skillx.sh/auth/signin
```

---

## Rollback Procedure

If production has issues:

```bash
# View recent deployments
wrangler deployments list --name skillx-web

# Rollback to previous version
wrangler rollback --name skillx-web

# Or redeploy from specific git commit
git checkout LAST_GOOD_COMMIT
pnpm build
wrangler deploy --name skillx-web
```

---

## Environment-Specific Configuration

### Development (`.dev.vars`)
```
ENVIRONMENT=development
BETTER_AUTH_URL=http://localhost:5173
GITHUB_CLIENT_ID=dev_client_id
GITHUB_CLIENT_SECRET=dev_client_secret
```

### Production (Cloudflare Secrets)
```
ENVIRONMENT=production
BETTER_AUTH_URL=https://skillx.sh
GITHUB_CLIENT_ID=[secret]
GITHUB_CLIENT_SECRET=[secret]
```

---

## Monitoring & Logging

### Cloudflare Logs

```bash
# Stream Worker logs
wrangler tail skillx-web

# Example output:
# ┌─ 2025-02-12 10:15:30 [GET] /api/search
# │ Duration: 245ms
# │ Status: 200
```

### Analytics

```bash
# View analytics in Cloudflare Dashboard
open https://dash.cloudflare.com/
# Navigate to: Workers & Pages → skillx → Analytics
```

### Database Performance

```bash
# Query D1 stats
wrangler d1 insights skillx-db

# Returns:
# Query count: 1,234
# Avg latency: 45ms
# Peak: 120ms
```

---

## Common Tasks

### Update Seed Data

```bash
# Modify seed-data.json
vim scripts/seed-data.json

# Re-seed production
curl -X POST https://skillx.sh/api/admin/seed
```

### Update Code

```bash
# Make changes to source
# Test locally: pnpm dev

# Commit changes
git add .
git commit -m "feat: add skill tags"

# Deploy
pnpm build
wrangler deploy --name skillx-web

# Verify
curl https://skillx.sh/api/search?query=test
```

### Add Environment Variable

```bash
# Add to local .dev.vars
echo "NEW_VAR=value" >> .dev.vars

# Add to production
wrangler secret put NEW_VAR --name skillx-web
# Enter value

# Update code to use env.NEW_VAR
# Redeploy
```

### Database Backup

```bash
# Export D1 database
wrangler d1 execute skillx-db --remote --json --command "SELECT * FROM skills LIMIT 1000" > backup.json

# Restore from backup (if needed)
# wrangler d1 execute skillx-db --remote --file=backup.sql
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized on API | Check GitHub OAuth credentials in secrets |
| Search returns 0 results | Run `/api/admin/seed` to load demo data |
| Slow page load (>2s) | Check D1 query performance, add indexes |
| "D1 database not found" | Verify database_id in wrangler.jsonc |
| Vectorize not working | Falls back to FTS5, check KV cache |
| Memory limit exceeded (Worker) | Split routes into separate Workers |

---

## Monitoring Checklist

Before releasing to production:

- [ ] All tests passing: `pnpm test`
- [ ] No TypeScript errors: `pnpm tsc --noEmit`
- [ ] Linting passes: `pnpm lint`
- [ ] Search latency <800ms (tested locally)
- [ ] GitHub OAuth working
- [ ] Seed data loaded
- [ ] Database indexes created
- [ ] Secrets configured
- [ ] Custom domain DNS propagated
- [ ] SSL certificate active

---

## Performance Optimization

### D1 Query Optimization

```sql
-- Add index for common searches
CREATE INDEX idx_skills_search ON skills(category, avg_rating DESC);

-- Run ANALYZE for query planning
ANALYZE;
```

### Vectorize Optimization

```typescript
// Limit vector search results to reduce network time
const results = await env.VECTORIZE.query(
  embedding,
  { topK: 50 }  // Limit to 50, not 100
);
```

### KV Cache Strategy

```typescript
// Cache frequently accessed data
const cacheKey = `skill:${skillId}:detail`;
const cached = await env.KV.get(cacheKey);
if (cached) return JSON.parse(cached);

// On miss, compute and cache
const result = await computeSkillDetail(skillId);
await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 1800 }); // 30 min
```

---

## Security Checklist

- [ ] API keys hashed (SHA-256)
- [ ] Session cookies httpOnly
- [ ] CORS configured for trusted origins
- [ ] Rate limiting enabled (100 req/min)
- [ ] Secrets not in version control
- [ ] SQL injection prevention (Drizzle ORM)
- [ ] XSS protection enabled (React default)
- [ ] HTTPS enforced (Cloudflare)

---

**Last Updated:** Feb 2025
**Version:** 1.0
