# Phase 1: Database & Credits Ledger

## Overview
- **Priority:** P1 (foundation for all other phases)
- **Status:** pending
- **Effort:** 5h

Create new tables for credits, transactions, earnings, payouts, and kits. Add `credit_cost` column to skills. Write manual ALTER TABLE migration.

## Requirements

### Functional
- Credit balances per user (integer, no floats)
- Transaction log with types: topup, usage, refund, payout
- Creator earnings tracking with pending/paid status
- Payout batch management
- Kits as collections of skills

### Non-functional
- All money values as integers (cents/credits)
- D1 batch operations for atomic credit mutations
- Indexes on foreign keys and lookup columns

## Architecture

```
credit_balances ← 1:1 with user
credit_transactions ← append-only ledger, FK to user
creator_earnings ← per-skill earning record, FK to transaction
payout_batches ← monthly aggregation
kits ← author-owned collections
kit_skills ← junction table
user_kits ← saved kits (like favorites)
skills.credit_cost ← new column
```

Credit mutation pattern (atomic UPDATE, NOT check-then-deduct):
1. `UPDATE credit_balances SET balance = balance - cost WHERE user_id = ? AND balance >= ?`
2. Check `changes()` — if 0 rows affected, balance insufficient → error
3. INSERT credit_transaction (negative amount)
4. INSERT creator_earnings (85% of cost)
5. `UPDATE credit_balances SET balance = balance + floor(cost * 85 / 100) WHERE user_id = ?` for creator

**CRITICAL:** Never SELECT-then-UPDATE. Atomic WHERE clause prevents double-spend.

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/lib/db/schema.ts` | MODIFY — add new table exports |
| `apps/web/app/lib/db/schema-credits.ts` | CREATE — credit_balances, credit_transactions, creator_earnings, payout_batches |
| `apps/web/app/lib/db/schema-kits.ts` | CREATE — kits, kit_skills, user_kits |
| `apps/web/app/lib/credits/credit-ledger.ts` | CREATE — deductCredits, addCredits, getBalance |
| `apps/web/app/lib/credits/credit-types.ts` | CREATE — type definitions |
| `apps/web/drizzle/XXXX_add_credits_tables.sql` | CREATE — manual migration |

## Implementation Steps

1. Create `schema-credits.ts` with tables:
   - `credit_balances`: user_id (PK, FK→user.id), balance (integer, default 0)
   - `credit_transactions`: id (text PK), user_id (text), amount (integer, signed), type (text: topup|usage|refund|payout), reference_id (text, nullable), description (text), created_at (timestamp_ms)
   - `creator_earnings`: id (text PK), creator_user_id (text), skill_id (text FK→skills.id), amount (integer), transaction_id (text FK→credit_transactions.id), status (text: pending|paid), payout_batch_id (text, nullable), created_at (timestamp_ms)
   - `payout_batches`: id (text PK), total_amount (integer), status (text: pending|processing|completed|failed), stripe_transfer_id (text, nullable), created_at (timestamp_ms)
   - `skill_purchases`: user_id (text), skill_id (text FK→skills.id), credit_cost (integer, price at time of purchase), created_at (timestamp_ms). UNIQUE(user_id, skill_id). Decoupled from installs table.
   - `topup_orders`: id (text PK), user_id (text), pack_id (text), credits (integer), amount_cents (integer), provider (text: stripe|sepay), provider_session_id (text, nullable), status (text: pending|completed|expired), created_at (timestamp_ms), expires_at (timestamp_ms)

2. Create `schema-kits.ts` with tables:
   - `kits`: id (text PK), name (text), slug (text unique), description (text), author_user_id (text), is_public (integer boolean, default true), created_at, updated_at
   - `kit_skills`: kit_id (text FK), skill_id (text FK), composite PK
   - `user_kits`: user_id (text), kit_id (text FK), created_at, composite unique

3. Re-export all new tables from `schema.ts`

4. Add `credit_cost` column to skills table in schema (integer, default 0)

5. Write manual SQL migration:
   ```sql
   ALTER TABLE skills ADD COLUMN credit_cost INTEGER DEFAULT 0;
   CREATE TABLE credit_balances (...);
   CREATE TABLE credit_transactions (...);
   CREATE TABLE creator_earnings (...);
   CREATE TABLE payout_batches (...);
   CREATE TABLE kits (...);
   CREATE TABLE kit_skills (...);
   CREATE TABLE user_kits (...);
   -- indexes
   ```

6. Create `credit-ledger.ts` with functions:
   - `getBalance(db, userId)` — returns integer balance
   - `addCredits(db, userId, amount, type, referenceId?, description?)` — inserts txn + upserts balance
   - `deductCredits(db, userId, amount, type, referenceId?, description?)` — atomic `UPDATE WHERE balance >= amount`, check `changes()`, insert txn. Returns `{ success, newBalance }` or throws InsufficientCredits. **Never SELECT then UPDATE.**
   - `processSkillPurchase(db, buyerUserId, creatorUserId, skillId, creditCost)` — atomic: deduct from buyer, credit 85% to creator, log creator_earnings

7. Create `credit-types.ts` with enums/types for transaction types, earning statuses

8. Run migration locally: `pnpm db:migrate`

9. Run typecheck: `pnpm typecheck`

## Todo List

- [ ] Create schema-credits.ts
- [ ] Create schema-kits.ts
- [ ] Update schema.ts exports
- [ ] Add credit_cost to skills schema
- [ ] Write manual SQL migration
- [ ] Create credit-ledger.ts
- [ ] Create credit-types.ts
- [ ] Add skill_purchases + topup_orders to schema-credits.ts + migration
- [ ] Run migration locally
- [ ] Run typecheck

## Success Criteria

- All tables created with correct types/indexes
- `deductCredits` fails atomically when balance insufficient
- `processSkillPurchase` correctly splits 85/15
- Typecheck passes

## Risk Assessment

- **D1 no real transactions**: Use atomic `UPDATE WHERE balance >= cost` + `changes()` check. Prevents double-spend without true transactions.
- **Schema drift**: Manual migrations may diverge from Drizzle schema. Always keep both in sync.
- **CHECK constraint**: Add `CHECK (balance >= 0)` on credit_balances. SQLite supports this. Defense-in-depth.

## Security Considerations

- Credit balance can never go negative — enforce in code AND add CHECK constraint if D1 supports it
- All credit mutations require authenticated user
- Transaction log is append-only, never delete/update
