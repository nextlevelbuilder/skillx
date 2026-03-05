# Phase 7: Creator Dashboard & Payouts

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 8h
- **Depends on:** Phase 1, Phase 2, Phase 4

Creator earnings dashboard + monthly Stripe Connect payouts.

## Requirements

### Functional
- Creator dashboard: total earnings, per-skill breakdown, monthly chart
- Payout history with status tracking
- Stripe Connect onboarding (Express accounts)
- Admin endpoint to trigger monthly payout batch
- Minimum payout threshold: $10 (1000 credits)

### Non-functional
- Dashboard data aggregated from creator_earnings table
- Payout batch is admin-triggered (not automated cron yet)

## Architecture

```
Creator Dashboard Page (/creator)
  → Loader fetches earnings summary, per-skill stats, payout history
  → "Set up payouts" → Stripe Connect onboarding
  → Monthly: Admin triggers POST /api/admin/payouts
    → Aggregates pending earnings per creator
    → Filters creators with Stripe Connect + balance >= 1000 credits
    → Creates payout_batch record
    → Initiates Stripe transfers
    → Marks creator_earnings as 'paid'
```

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/lib/credits/creator-earnings-queries.ts` | CREATE — earnings aggregation |
| `apps/web/app/lib/credits/payout-processor.ts` | CREATE — batch payout logic |
| `apps/web/app/routes/creator.tsx` | CREATE — dashboard page |
| `apps/web/app/routes/api.creator-earnings.ts` | CREATE — earnings API |
| `apps/web/app/routes/api.creator-connect.ts` | CREATE — Stripe Connect onboarding |
| `apps/web/app/routes/api.admin-payouts.ts` | CREATE — trigger payout batch |
| `apps/web/app/components/earnings-chart.tsx` | CREATE — monthly earnings chart |
| `apps/web/app/components/earnings-table.tsx` | CREATE — per-skill breakdown |
| `apps/web/app/routes/routes.ts` | MODIFY — add /creator route |

## Implementation Steps

1. Create `creator-earnings-queries.ts`:
   - `getEarningsSummary(db, creatorUserId)` → `{ totalEarned, totalPaid, pendingBalance }`
   - `getPerSkillEarnings(db, creatorUserId)` → array of `{ skillId, skillName, totalEarned, purchaseCount }`
   - `getMonthlyEarnings(db, creatorUserId, months=12)` → array of `{ month, amount }`
   - `getPayoutHistory(db, creatorUserId)` → array of payout batches

2. Create `payout-processor.ts`:
   - `calculatePayoutBatch(db)` → aggregates pending earnings from `creator_earnings` table (NOT credit_balances), groups by creator
   - `executePayoutBatch(db, env, batchId)`:
     - Create `payout_batch` record FIRST with unique ID, status='processing'
     - Check no other batch with status='processing' exists (prevent double-trigger)
     - For each creator with Stripe Connect + pending earnings >= 1000 credits:
       - Create Stripe transfer with idempotency key = `{batchId}_{creatorId}`
       - Update creator_earnings status to 'paid', set payout_batch_id
       - **DO NOT deduct from credit_balances** — earnings are tracked separately in creator_earnings, not as spendable credits
     - Update payout_batch status to 'completed' or 'failed'
   - **IMPORTANT:** Creator earnings are NOT spendable credits. They accumulate in `creator_earnings` until paid out via Stripe Connect. If creator wants to spend earnings as credits, that requires an explicit "withdraw to balance" action (future feature).

3. Create `api.creator-earnings.ts`:
   - Require auth
   - Return earnings summary, per-skill breakdown, monthly data

4. Create `api.creator-connect.ts`:
   - POST: create/return Stripe Connect onboarding link
   - GET: check Connect status (is onboarded?)
   - Uses stripe-connect.ts from Phase 2

5. Create `api.admin-payouts.ts`:
   - Require admin secret
   - POST: trigger `calculatePayoutBatch()` then `executePayoutBatch()`
   - Return batch summary

6. Create `creator.tsx`:
   - Loader: fetch earnings data
   - Layout: earnings summary cards (total, pending, paid) + chart + per-skill table + payout history
   - "Set up Stripe payouts" CTA if not connected
   - Dark theme, mint accent

7. Create `earnings-chart.tsx`:
   - Simple bar chart (CSS-only or lightweight, no heavy chart lib)
   - Monthly earnings over last 12 months

8. Create `earnings-table.tsx`:
   - Sortable table: skill name, purchases, total earned
   - Reuse patterns from leaderboard-table

9. Update `routes.ts`: add `/creator` route (auth required)

10. Add navbar link to "Creator" for authenticated users who have skills

## Todo List

- [ ] Create creator-earnings-queries.ts
- [ ] Create payout-processor.ts
- [ ] Create api.creator-earnings.ts
- [ ] Create api.creator-connect.ts
- [ ] Create api.admin-payouts.ts
- [ ] Create creator.tsx
- [ ] Create earnings-chart.tsx
- [ ] Create earnings-table.tsx
- [ ] Update routes.ts
- [ ] Typecheck
- [ ] Test earnings aggregation
- [ ] Test Stripe Connect onboarding flow
- [ ] Test payout batch (sandbox)

## Success Criteria

- Creator sees accurate earnings breakdown
- Stripe Connect onboarding works end-to-end
- Payout batch correctly transfers funds and marks earnings paid
- Only creators with >= $10 pending receive payouts

## Risk Assessment

- **Stripe Connect country support**: Express accounts available in 40+ countries. Some creators may not be eligible. Show clear message.
- **Failed transfers**: Stripe transfer may fail (insufficient platform balance, account issues). Mark batch as failed, don't mark earnings as paid. Retry next month.
- **Tax implications**: Platform acts as marketplace facilitator. May need 1099-K reporting for US creators > $600. Document but don't implement yet.

## Security Considerations

- Admin payout endpoint requires ADMIN_SECRET
- Creator can only see their own earnings
- Stripe Connect account creation rate-limited
- Never expose other creators' earnings data
- Payout amounts verified against actual transaction records (no user-supplied amounts)
