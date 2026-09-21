# Code Review: Admin Recompute Endpoint

## Scope
- `apps/web/app/lib/leaderboard/recompute-all-skills.ts` (243 LOC)
- `apps/web/app/routes/api.admin.recompute.ts` (121 LOC)
- Compared against: `recompute-skill-scores.ts` (single-skill), `api.admin.seed.ts` (admin pattern)

## Overall Assessment

Solid implementation. Checkpoint/resume pattern is well-designed, batch logic is correct, and admin auth follows existing patterns. A few correctness bugs (one critical date issue), some edge cases, and minor improvements below.

---

## Critical Issues

### 1. Date in raw SQL uses `Date` object instead of milliseconds (BUG)

**File:** `recompute-all-skills.ts` lines 151, 156

```ts
.where(sql`skill_id = ${skill.id} AND created_at > ${sevenDaysAgo}`);
```

`sevenDaysAgo` is a `Date` object passed into a raw `sql` template literal. The `created_at` column is `timestamp_ms` mode, which stores **integer milliseconds** in SQLite. Drizzle only auto-converts `Date` -> ms in typed query builders (e.g., `gt()`), NOT in raw `sql` template literals. This will compare an integer column against a stringified `Date` object, producing zero matches.

**The single-skill version (`recompute-skill-scores.ts`) does it correctly** using typed `gt()` with `and()`:
```ts
.where(and(eq(ratings.skill_id, skillId), gt(ratings.created_at, sevenDaysAgo)));
```

**Fix:** Either use typed Drizzle operators like the single-skill version, or use `sevenDaysAgoMs` (the integer) in the raw SQL:

```ts
.where(sql`skill_id = ${skill.id} AND created_at > ${sevenDaysAgoMs}`);
```

**Impact:** Trending scores will be computed with zero recent activity, making ALL trending scores 0. This silently degrades leaderboard quality without erroring.

---

## High Priority

### 2. N+1 query pattern -- 4 queries per skill in the batch loop

**File:** `recompute-all-skills.ts` lines 139-166

Each skill in a batch of 100 executes 4 individual queries (favorites count, recent ratings, recent usage, success data) plus 1 update = 5 DB round-trips per skill. For 100-skill batch = 500 queries.

The single-skill version has the same pattern (acceptable for a single inline recompute), but for bulk processing this is expensive on D1.

**Recommendation:** Consider batching the aggregation queries. For example, fetch all favorite counts for the batch in a single query:
```sql
SELECT skill_id, count(*) FROM favorites WHERE skill_id IN (...) GROUP BY skill_id
```
Same for recent ratings, recent usage, and success data. This reduces 400 queries to 4 per batch.

Not a blocker for an admin-only endpoint, but will matter if skill count grows.

### 3. `all=true` mode has no timeout protection on Workers

**File:** `api.admin.recompute.ts` lines 59-91

The `while (result.nextOffset !== null)` loop runs all batches in a single request. Cloudflare Workers have a 30-second CPU time limit (can be extended with paid plans). With the N+1 pattern above, a large skill set could exceed this.

**Recommendation:** Add a max-iterations guard or document the batch size recommendation:
```ts
const MAX_BATCHES = 50;
while (result.nextOffset !== null && batchCount < MAX_BATCHES) { ... }
```
If exceeded, return partial result with `nextOffset` so the caller can resume.

### 4. No concurrency guard

Two simultaneous POST requests to `all=true` will race, both reading and writing the same KV state and processing overlapping skill batches. No locking mechanism.

**Recommendation:** Add a simple optimistic lock: on first batch, check if `status === "running"` and `lastBatchAt` is recent (< 5 min). If so, reject with 409 Conflict. This is sufficient for an admin endpoint.

---

## Medium Priority

### 5. `recompute-all-skills.ts` exceeds 200 LOC limit

The file is 243 lines. Per project conventions, files should be under 200 LOC. The batch processing loop (lines 139-207) could be extracted to a helper function.

### 6. `totalProcessed` calculation may overcount on resume

**File:** `recompute-all-skills.ts` line 215

```ts
totalProcessed: (savedState?.totalProcessed ?? offset) + batch.length,
```

When `options.offset` is explicitly provided (not from resume), `savedState` is null, so `totalProcessed` falls back to `offset + batch.length`. If offset is 200 and batch is 100, it reports 300 "processed" even though only 100 were processed in this session. This is cosmetic but misleading.

**Fix:** Track session-processed vs. cumulative-processed separately, or only count from the current run start.

### 7. Secret in query string is logged in access logs

**File:** `api.admin.recompute.ts` line 22

```ts
const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret");
```

Supporting `?secret=X` in query params means the admin secret appears in URL access logs, browser history, and Cloudflare analytics. The seed endpoint uses header-only auth.

**Recommendation:** Prefer header-only auth (`X-Admin-Secret`) to match the seed endpoint pattern. If query param support is needed for quick curl testing, add a comment warning about log exposure.

### 8. Input validation for `batch` and `offset` params

**File:** `api.admin.recompute.ts` lines 50-51

```ts
const batchSize = parseInt(url.searchParams.get("batch") ?? "100", 10);
```

No validation that `batchSize` is positive, reasonable, or even a number. `parseInt("abc")` returns `NaN`. Similarly for `offset`.

**Fix:**
```ts
const batchSize = Math.min(Math.max(parseInt(batch ?? "100", 10) || 100, 1), 500);
```

---

## Low Priority

### 9. Redundant ternary on line 214

```ts
offset: isComplete ? newOffset : newOffset,
```
Both branches return the same value.

### 10. `env` cast inconsistency in route file

The `loader` casts `env` as `Record<string, string>` (line 28), then re-casts for KV as `Record<string, unknown>` (line 33). The `action` casts as `Record<string, unknown>` (line 44), then downcasts for `verifyAdmin`. The seed endpoint accesses `context.cloudflare.env` directly. Consider a consistent pattern.

---

## Positive Observations

- KV checkpoint with 24h TTL auto-cleanup is a good design -- avoids stale state accumulating
- `clearState` on completion is correct
- Deterministic ordering (`ORDER BY skills.id`) ensures resumability
- Resume logic correctly checks `status === "running"` before resuming from saved offset
- Error handling in the route wraps everything in try/catch with proper status codes
- Scoring logic correctly mirrors the single-skill version (same functions, same params)

---

## Recommended Actions (priority order)

1. **[CRITICAL]** Fix `sevenDaysAgo` -> `sevenDaysAgoMs` in raw SQL where clauses (lines 151, 156)
2. **[HIGH]** Add max-batch guard for `all=true` mode to prevent Worker timeout
3. **[HIGH]** Add concurrency check (reject if another run is active)
4. **[MEDIUM]** Remove `?secret=` query param auth; use header-only like seed endpoint
5. **[MEDIUM]** Validate and clamp `batch` / `offset` params
6. **[MEDIUM]** Fix redundant ternary on line 214
7. **[LOW]** Consider batching aggregation queries (N+1 optimization) if skill count grows past 500

---

## Metrics
- TypeScript: Clean (0 errors from `apps/web`)
- Linting: Not run (no new lint issues visible)
- Test coverage: No tests for this admin endpoint (acceptable -- admin-only, mirrors tested scoring functions)

## Unresolved Questions
- Is there a known upper bound for skill count? If staying under ~500, the N+1 pattern is acceptable. If scaling to thousands, batch aggregation becomes important.
- Should the `all=true` endpoint use `waitUntil()` to run in background and return immediately? Would improve UX for large recomputes.
