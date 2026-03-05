# Phase 2: Stripe Integration

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 8h
- **Depends on:** Phase 1

Stripe Checkout for credit topups. Stripe Connect for creator payouts. Webhook handler for payment confirmation.

## Requirements

### Functional
- Users buy credit packs via Stripe Checkout (e.g., 500/$5, 2000/$20, 5000/$50)
- Webhook confirms payment → credits added to user balance
- Stripe Connect onboarding for creators wanting payouts
- Settings page shows balance + topup button

### Non-functional
- Webhook signature verification (HMAC)
- Idempotent webhook processing (deduplicate by checkout session ID)
- Stripe SDK runs server-side only (CF Workers compatible)

## Architecture

```
User clicks "Buy Credits" → POST /api/credits/topup → Stripe Checkout Session
  → User pays on Stripe hosted page
  → Stripe sends webhook → POST /api/webhooks/stripe
  → Verify signature → Find user → addCredits() → Return 200
```

Credit packs (configurable):
| Pack | Credits | Price | Savings |
|------|---------|-------|---------|
| Starter | 500 | $5.00 | — |
| Popular | 2,000 | $18.00 | 10% |
| Pro | 5,000 | $40.00 | 20% |

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/lib/stripe/stripe-client.ts` | CREATE — Stripe SDK init |
| `apps/web/app/lib/stripe/credit-packs.ts` | CREATE — pack definitions |
| `apps/web/app/lib/stripe/stripe-connect.ts` | CREATE — Connect onboarding helpers |
| `apps/web/app/routes/api.credits-topup.ts` | CREATE — POST handler |
| `apps/web/app/routes/api.webhooks-stripe.ts` | CREATE — webhook handler |
| `apps/web/app/routes/api.credits-balance.ts` | CREATE — GET balance + txns |
| `apps/web/app/components/credits-topup-modal.tsx` | CREATE — pack selection UI |
| `apps/web/app/routes/settings.tsx` | MODIFY — add credits section |

## Implementation Steps

1. Install Stripe SDK: `pnpm add stripe --filter @skillx/web`

2. Create `stripe-client.ts`:
   - Init Stripe with `env.STRIPE_SECRET_KEY`
   - Export `getStripe(env)` factory (Workers-compatible, no global singleton)

3. Create `credit-packs.ts`:
   - Export `CREDIT_PACKS` array with id, credits, priceInCents, name
   - Validation helper: `getPackById(packId)`

4. Create `api.credits-topup.ts`:
   - Require auth (session)
   - Accept `{ packId }` in body
   - **Store pending order in DB**: INSERT into `topup_orders(id, user_id, pack_id, credits, amount_cents, stripe_session_id, status, created_at)` with status='pending'
   - Create Stripe Checkout Session with metadata: `{ orderId }` (minimal — truth is in DB)
   - Line item = pack price, mode = "payment"
   - Success URL: `{APP_URL}/settings?topup=success`
   - Cancel URL: `{APP_URL}/settings?topup=cancelled`
   - Update topup_orders with stripe_session_id
   - Return `{ checkoutUrl }`
   - **NOTE:** Add `topup_orders` table to Phase 1 migration

5. Create `api.webhooks-stripe.ts`:
   - Read raw body (not JSON parsed)
   - Verify webhook signature with `stripe.webhooks.constructEvent()`
   - Handle `checkout.session.completed`:
     - Extract orderId from metadata (or stripe session ID)
     - **Look up topup_orders by stripe_session_id** — use DB-stored userId, credits (NOT metadata)
     - Check order status != 'completed' (idempotency)
     - `addCredits(db, order.userId, order.credits, 'topup', order.id, 'Stripe topup')`
     - Update order status to 'completed'
   - Return 200 always (Stripe retries on non-2xx)

6. Create `api.credits-balance.ts`:
   - Require auth
   - Return `{ balance, recentTransactions: [...last 20] }`

7. Create `credits-topup-modal.tsx`:
   - Display credit packs as cards
   - Click → POST /api/credits/topup → redirect to Stripe

8. Modify `settings.tsx`:
   - Add "Credits" section: current balance, topup button, recent transactions list

9. Create `stripe-connect.ts`:
   - `createConnectAccount(env, userId, email)` — creates Express account
   - `getOnboardingLink(env, accountId)` — returns onboarding URL
   - Store Stripe Connect account ID on user (add `stripe_connect_id` column to user table or separate table)

10. Add env vars to `.dev.vars` and wrangler.jsonc secrets list

11. Typecheck + test locally with Stripe CLI: `stripe listen --forward-to localhost:5173/api/webhooks/stripe`

## Todo List

- [ ] Install Stripe SDK
- [ ] Create stripe-client.ts
- [ ] Create credit-packs.ts
- [ ] Create api.credits-topup.ts
- [ ] Create api.webhooks-stripe.ts
- [ ] Create api.credits-balance.ts
- [ ] Create credits-topup-modal.tsx
- [ ] Add credits section to settings.tsx
- [ ] Create stripe-connect.ts
- [ ] Add stripe_connect_id column migration
- [ ] Configure env vars
- [ ] Test with Stripe CLI

## Success Criteria

- Can complete Stripe checkout and see credits appear in balance
- Webhook is idempotent (duplicate events don't double-credit)
- Settings page shows accurate balance and transaction history

## Risk Assessment

- **Stripe SDK on CF Workers**: Stripe JS SDK works on Workers since v10+. Verify `stripe` package version.
- **Webhook body parsing**: React Router may auto-parse body. Need raw body for signature verification — use `request.text()` before `constructEvent()`.
- **Double credit on retry**: Idempotency check via reference_id prevents this.

## Security Considerations

- Webhook signature MUST be verified — never trust unverified payloads
- Stripe secret key in env vars only, never client-side
- Checkout session metadata is server-set, user cannot tamper
- Rate limit topup endpoint to prevent abuse
