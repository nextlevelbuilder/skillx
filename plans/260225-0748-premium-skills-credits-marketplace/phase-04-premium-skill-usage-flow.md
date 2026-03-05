# Phase 4: Premium Skill Usage Flow

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 6h
- **Depends on:** Phase 1

Gate premium skill content behind credit check. Deduct credits on install/use. Split revenue 85/15.

## Requirements

### Functional
- Skills with `credit_cost > 0` require credits to access full content
- Install endpoint checks balance, deducts credits, logs transaction
- 402 Payment Required if insufficient credits
- Creator gets 85% credited to their balance
- Free preview: name, description, rating visible. Full SKILL.md content gated.
- Already-purchased skills: no re-charge (check installs table)

### Non-functional
- Atomic credit deduction (no double-charge)
- CLI must handle 402 gracefully with helpful message

## Architecture

```
GET /api/skills/:slug (detail) → always returns metadata, marks is_paid + credit_cost
POST /api/skills/:slug/install →
  if skill.credit_cost == 0: existing flow (free)
  if skill.credit_cost > 0:
    1. Check if already purchased (installs table has record for this user+skill)
    2. If purchased: return content (no charge)
    3. If not: check balance >= credit_cost
    4. If insufficient: 402 { error, balance, required }
    5. If sufficient: processSkillPurchase() → insert install → return content
```

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/routes/api.skill-install.ts` | MODIFY — add credit check + deduction |
| `apps/web/app/routes/api.skill-detail.ts` | MODIFY — include credit_cost in response |
| `apps/web/app/lib/credits/credit-ledger.ts` | USE — processSkillPurchase() |
| `apps/web/app/lib/credits/purchase-check.ts` | CREATE — hasPurchased(db, userId, skillId) |
| `apps/web/app/routes/skill-detail.tsx` | MODIFY — show price badge, purchase button |
| `packages/cli/src/commands/use.ts` | MODIFY — handle 402 response |

## Implementation Steps

1. Create `purchase-check.ts`:
   - `hasPurchased(db, userId, skillId)` — check **`skill_purchases`** table (NOT installs)
   - Returns boolean
   - **NOTE:** Add `skill_purchases` table to Phase 1 migration: `skill_purchases(user_id TEXT, skill_id TEXT, credit_cost INTEGER, created_at, UNIQUE(user_id, skill_id))`. Decoupled from installs table which tracks anonymous device-based installs.

2. Modify `api.skill-install.ts`:
   - After finding skill, check `skill.credit_cost`
   - If `credit_cost > 0` AND user authenticated:
     - Call `hasPurchased()` — if true, skip payment, return content
     - If not purchased: call `processSkillPurchase(db, buyerUserId, creatorUserId, skillId, creditCost)`
     - If InsufficientCredits error: return 402 with `{ error: "Insufficient credits", balance, required: credit_cost }`
   - If `credit_cost > 0` AND no auth: return 401 with message about needing account + credits
   - Free skills: unchanged behavior

3. Modify `api.skill-detail.ts`:
   - Include `credit_cost` in response
   - If premium + user authenticated: include `is_purchased` flag

4. Modify `skill-detail.tsx`:
   - Show credit cost badge next to skill name
   - If not purchased: show "Purchase for X credits" button instead of install command
   - If purchased: show install command as normal
   - Show "Free" badge for free skills

5. Modify CLI `use.ts`:
   - Handle 402 response: display "This skill costs X credits. Your balance: Y. Top up at https://skillx.sh/settings"
   - Handle 401 for premium skills: "Premium skill requires account. Sign up at https://skillx.sh"

6. Resolve creator user mapping:
   - Skills have `author` (string, e.g., "anthropic") but need `creator_user_id` for earnings
   - Add `author_user_id` column to skills table (nullable, FK→user.id)
   - When user registers a skill via `/api/skills/register`, set `author_user_id` to their user ID
   - If `author_user_id` is null (seeded skills), platform keeps 100% until claimed

7. Write migration: `ALTER TABLE skills ADD COLUMN author_user_id TEXT;`

## Todo List

- [ ] Create purchase-check.ts
- [ ] Modify api.skill-install.ts with credit gating
- [ ] Modify api.skill-detail.ts to include credit_cost
- [ ] Modify skill-detail.tsx for premium UI
- [ ] Modify CLI use.ts for 402 handling
- [ ] Add author_user_id column + migration
- [ ] Update skill register endpoint to set author_user_id
- [ ] Typecheck
- [ ] Test free + premium + already-purchased flows

## Success Criteria

- Free skills work unchanged
- Premium skill without credits returns 402 with balance info
- Premium skill with credits deducts and serves content
- Re-access purchased skill costs nothing
- Creator balance increases by 85%
- CLI shows helpful message on 402

## Risk Assessment

- **Race condition on concurrent purchase**: Mitigated by atomic `UPDATE WHERE balance >= cost` in credit-ledger.ts. UNIQUE constraint on `skill_purchases(user_id, skill_id)` prevents duplicate purchase records.
- **Orphan earnings**: If author_user_id is null, earnings go to platform. Need claim flow later.
- **Price changes**: Store `credit_cost` at time of purchase in `skill_purchases.credit_cost`. UI shows current price for new buyers, purchase record for existing buyers.
- **Unbounded credit_cost**: Cap at 10,000 credits ($100) server-side in register/update endpoints.

## Security Considerations

- Never serve premium content without valid credit deduction or purchase record
- Verify user identity before any credit operation
- Don't leak full SKILL.md content in error responses
