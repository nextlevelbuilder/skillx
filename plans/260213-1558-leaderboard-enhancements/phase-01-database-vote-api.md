# Phase 1: Database Migration + Vote API

## Context

- [Schema](../../apps/web/app/lib/db/schema.ts) (207 LOC)
- [Favorite API](../../apps/web/app/routes/api.skill-favorite.ts) (template pattern)
- [Routes config](../../apps/web/app/routes.ts)
- [Migration examples](../../apps/web/drizzle/migrations/)

## Overview

- **Priority:** P1 (blocking for phases 2-4)
- **Status:** Complete
- **Effort:** 2h
- **Description:** Create `votes` table, add `upvote_count`/`downvote_count`/`net_votes` columns to `skills`, build vote API endpoint following favorite API pattern.

## Key Insights

- Favorite API (`api.skill-favorite.ts`) is the exact template: slug lookup, auth check, toggle, fire-and-forget recompute
- Vote differs from favorite: 3 states (up/down/none) vs 2 (toggle), so body needs `{ type: 'up' | 'down' | 'none' }`
- Manual ALTER TABLE migration (like `0003_add-github-stars.sql`) -- do NOT use Drizzle auto-generate
- Precomputed `net_votes` on skills table avoids COUNT query on every leaderboard load
<!-- Red Team: Vote Count Race Condition — 2026-02-13 -->
- **Atomicity:** Vote count update must use a single SQL statement with subquery (not separate COUNT then UPDATE) to prevent race conditions under concurrent requests
<!-- Red Team: No Vote Rate Limiting — 2026-02-13 -->
- **Rate limiting:** Implement basic rate limiting (10 votes/min per user) in this phase — not deferred to future iteration

## Architecture

```
Client POST /api/skills/:slug/vote { type: 'up'|'down'|'none' }
  --> Auth check (session required)
  --> Lookup skill by slug
  --> Check existing vote
  --> UPSERT or DELETE vote row
  --> Update skills.upvote_count / downvote_count / net_votes
  --> Fire-and-forget recomputeSkillScores()
  --> Return { vote_type, net_votes }
```

## Related Code Files

### Files to Create
- `apps/web/drizzle/migrations/0007_add-votes-table.sql` (0006 reserved for [refs/scripts plan](../260213-1218-skill-references-scripts/phase-01-database-schema-migration.md))
- `apps/web/app/routes/api.skill-vote.ts`

### Files to Modify
- `apps/web/app/lib/db/schema.ts` -- add votes table + skills columns
- `apps/web/app/routes.ts` -- register vote route

## Implementation Steps

### Step 1: Migration SQL

Create `apps/web/drizzle/migrations/0007_add-votes-table.sql`:

> **Note:** If refs/scripts plan (0006) isn't implemented first, use `0006` instead.

```sql
-- votes table
CREATE TABLE `votes` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `skill_id` text NOT NULL,
  `vote_type` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_votes_user_skill` ON `votes` (`user_id`, `skill_id`);
--> statement-breakpoint
CREATE INDEX `idx_votes_skill` ON `votes` (`skill_id`);
--> statement-breakpoint

-- precomputed vote counts on skills
ALTER TABLE `skills` ADD COLUMN `upvote_count` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `skills` ADD COLUMN `downvote_count` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `skills` ADD COLUMN `net_votes` integer DEFAULT 0;
--> statement-breakpoint
CREATE INDEX `idx_skills_net_votes` ON `skills` (`net_votes`);
--> statement-breakpoint
<!-- Red Team: Category Filter Missing DB Index — 2026-02-13 -->
CREATE INDEX `idx_skills_category` ON `skills` (`category`);
```

### Step 2: Update Drizzle schema

Add to `apps/web/app/lib/db/schema.ts`:

```ts
// Votes - Reddit-style upvote/downvote
export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id").notNull(),
    skill_id: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    vote_type: text("vote_type").notNull(), // 'up' | 'down'
    created_at: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updated_at: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_votes_user_skill").on(table.user_id, table.skill_id),
    index("idx_votes_skill").on(table.skill_id),
  ]
);
```

Add to `skills` table definition (after `favorite_count`):

```ts
upvote_count: integer("upvote_count").default(0),
downvote_count: integer("downvote_count").default(0),
net_votes: integer("net_votes").default(0),
```

Add index to skills table indexes:

```ts
index("idx_skills_net_votes").on(table.net_votes),
```

### Step 3: Vote API endpoint

Create `apps/web/app/routes/api.skill-vote.ts` following favorite API pattern:

```ts
// POST /api/skills/:slug/vote
// Body: { type: 'up' | 'down' | 'none' }
// Returns: { vote_type: 'up' | 'down' | null, net_votes: number }

import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, votes } from "~/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const slug = params.slug;
    if (!slug) return Response.json({ error: "Skill slug required" }, { status: 400 });

    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Auth required
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    // Validate body
    const body = await request.json();
    const voteType = body?.type;
    if (!["up", "down", "none"].includes(voteType)) {
      return Response.json({ error: "type must be 'up', 'down', or 'none'" }, { status: 400 });
    }

    // Find skill
    const [skill] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, slug))
      .limit(1);
    if (!skill) return Response.json({ error: "Skill not found" }, { status: 404 });

    // Check existing vote
    const [existing] = await db
      .select()
      .from(votes)
      .where(and(eq(votes.user_id, session.user.id), eq(votes.skill_id, skill.id)))
      .limit(1);

    const now = new Date();

    if (voteType === "none") {
      // Remove vote
      if (existing) {
        await db.delete(votes).where(eq(votes.id, existing.id));
      }
    } else if (existing) {
      // Update existing vote
      await db.update(votes)
        .set({ vote_type: voteType, updated_at: now })
        .where(eq(votes.id, existing.id));
    } else {
      // Insert new vote
      await db.insert(votes).values({
        id: crypto.randomUUID(),
        user_id: session.user.id,
        skill_id: skill.id,
        vote_type: voteType,
        created_at: now,
        updated_at: now,
      });
    }

    // <!-- Red Team: Vote Count Race Condition — 2026-02-13 -->
    // Atomic vote count update: single statement with subquery to prevent race conditions
    await db.run(sql`
      UPDATE skills SET
        upvote_count = (SELECT count(*) FROM votes WHERE skill_id = ${skill.id} AND vote_type = 'up'),
        downvote_count = (SELECT count(*) FROM votes WHERE skill_id = ${skill.id} AND vote_type = 'down'),
        net_votes = (SELECT count(case when vote_type = 'up' then 1 end) - count(case when vote_type = 'down' then 1 end) FROM votes WHERE skill_id = ${skill.id})
      WHERE id = ${skill.id}
    `);

    // Read back for response
    const [updated] = await db.select({ net_votes: skills.net_votes }).from(skills).where(eq(skills.id, skill.id));

    // Fire-and-forget recompute
    recomputeSkillScores(db, skill.id).catch((err) =>
      console.error("Failed to recompute scores after vote:", err)
    );

    return Response.json({
      vote_type: voteType === "none" ? null : voteType,
      net_votes: updated?.net_votes ?? 0,
    });
  } catch (error) {
    console.error("Error processing vote:", error);
    return Response.json({ error: "Failed to process vote" }, { status: 500 });
  }
}
```

### Step 4: Register route

Add to `apps/web/app/routes.ts`:

```ts
route("api/skills/:slug/vote", "routes/api.skill-vote.ts"),
```

### Step 5: Apply migration

```bash
cd apps/web && npx wrangler d1 migrations apply skillx-db --local
cd apps/web && npx wrangler d1 migrations apply skillx-db --remote
```

## Todo List

- [x] Create migration SQL file `0007_add-votes-table.sql` (or 0006 if refs plan not done)
- [x] Add `votes` table to Drizzle schema
- [x] Add `upvote_count`, `downvote_count`, `net_votes` columns to skills schema
- [x] Add `idx_skills_net_votes` index to skills schema
- [x] Add `idx_skills_category` index to migration SQL (for Phase 2 category filter)
- [x] Create `api.skill-vote.ts` route handler
- [x] Register route in `routes.ts`
- [x] Apply migration locally
- [x] Apply migration to remote D1
- [x] Test: POST vote up, verify response `{ vote_type: 'up', net_votes: 1 }`
- [x] Test: POST vote down on same skill, verify vote changed
- [x] Test: POST vote none, verify vote removed
- [x] Test: Unauthenticated request returns 401
- [x] Implement vote rate limiting (10 votes/min per user)
- [x] Run `pnpm typecheck`

## Success Criteria

- `votes` table exists with unique constraint on `(user_id, skill_id)`
- `skills` table has `upvote_count`, `downvote_count`, `net_votes` columns
- Vote API handles up/down/none transitions correctly
- Vote counts on skills table stay in sync
- Existing 133K skills get default 0 for all vote columns
- No regressions in existing favorite/rating flows

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Migration fails on production 133K skills | ALTER TABLE ADD COLUMN with DEFAULT is instant in SQLite |
| Double vote race condition | Unique index `(user_id, skill_id)` prevents duplicates; D1 serializes writes |
| Vote count drift from crash | Count query on every vote ensures consistency; no increment-only logic |

## Security Considerations

- Session auth required for all vote mutations
- `vote_type` validated against whitelist `['up', 'down', 'none']`
- Skill looked up by slug (public identifier), not by internal ID
<!-- Red Team: No Vote Rate Limiting — 2026-02-13 -->
<!-- Updated: Validation Session 1 - Rate limiting uses DB query -->
- Rate limiting: implement 10 votes/min per user using DB query: `SELECT COUNT(*) FROM votes WHERE user_id = ? AND updated_at > (now - 60s)`. If count >= 10, return 429. No KV dependency needed.
- No PII stored in votes table beyond user_id reference
