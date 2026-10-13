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

For production, use Cloudflare Secrets:

```bash
# Set secrets on production Worker
wrangler secret put BETTER_AUTH_SECRET --env production
wrangler secret put GITHUB_CLIENT_ID --env production
wrangler secret put GITHUB_CLIENT_SECRET --env production
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
wrangler d1 create skillx-db --environment production

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
wrangler kv:namespace create skillx-cache --environment production

# Returns:
# [[kv_namespaces]]
# binding = "KV"
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Copy to wrangler.jsonc
```

#### Create Vectorize Index

```bash
# Create production Vectorize
wrangler vectorize create skillx-skills --environment production

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
wrangler d1 migrations apply skillx-db --environment production

# Verify
wrangler d1 execute skillx-db --environment production --command "SELECT COUNT(*) FROM skills"
```

#### Seed Production Data

```bash
# Get production Worker URL
WORKER_URL=$(wrangler deployments list --env production | grep -oP 'https://[^ ]+')

# Seed skills
curl -X POST $WORKER_URL/api/admin/seed

# Verify
curl $WORKER_URL/api/search?query=vercel
```

### Phase 3: Secrets Configuration

```bash
# Set authentication secrets
wrangler secret put BETTER_AUTH_SECRET --environment production
# Enter secret value (e.g., 64 random hex chars)

# Set GitHub OAuth credentials
wrangler secret put GITHUB_CLIENT_ID --environment production
wrangler secret put GITHUB_CLIENT_SECRET --environment production

# Verify secrets are set
wrangler secret list --environment production
```

#### Release publishing (off by default)

The release publish API (`POST /api/v1/packages/@publisher/slug/releases`,
see [API reference](./api-reference.md#publishing-releases)) answers `404`
until the `SKILLX_RELEASES_API` var in `apps/web/wrangler.jsonc` is `"1"`.
Before enabling it:

1. Apply migration `0012_api_key_scopes` (adds nullable `api_keys.scopes`).
2. Set the registry signing secrets. The key is an Ed25519 private key as
   base64 PKCS #8 DER; its id must match the published registry key
   (`skillx-reg-993cd14a011f7b76`). Paste values at the prompt; never put the
   key in a file under the repo, a command line or logs.
   ```bash
   wrangler secret put SKILLX_REGISTRY_SIGNING_KEY --environment production
   wrangler secret put SKILLX_REGISTRY_SIGNING_KEY_ID --environment production
   ```
   Without them every upload fails closed with `503 release.signing_unavailable`.
3. Publishers create a key with `POST /api/user/api-keys` and
   `{"scopes": ["releases:publish:@handle"]}` and store it as the
   `SKILLX_PUBLISH_KEY` secret for `.github/workflows/publish-release.yml`.

Rollback: set `SKILLX_RELEASES_API` back to `"0"` and redeploy. Stored R2
objects and release rows are immutable and stay in place; migration 0012's
header holds the SQL to revoke scoped keys and drop the column.

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
wrangler deploy --env production

# Output shows:
# Deployed to https://skillx.sh

# Verify deployment
curl https://skillx.sh
```

### Phase 6: Verification

```bash
# Check Worker status
wrangler deployments list --env production

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
wrangler deployments list --env production

# Rollback to previous version
wrangler rollback --env production

# Or redeploy from specific git commit
git checkout LAST_GOOD_COMMIT
pnpm build
wrangler deploy --env production
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
wrangler tail --env production

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
wrangler d1 insights --env production

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
wrangler deploy --env production

# Verify
curl https://skillx.sh/api/search?query=test
```

### Add Environment Variable

```bash
# Add to local .dev.vars
echo "NEW_VAR=value" >> .dev.vars

# Add to production
wrangler secret put NEW_VAR --environment production
# Enter value

# Update code to use env.NEW_VAR
# Redeploy
```

### Database Backup

```bash
# Export D1 database
wrangler d1 execute skillx-db --environment production --json --command "SELECT * FROM skills LIMIT 1000" > backup.json

# Restore from backup (if needed)
# wrangler d1 execute skillx-db --environment production < backup.sql
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
