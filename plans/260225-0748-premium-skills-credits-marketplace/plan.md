---
title: "Premium Skills & Credits Marketplace"
description: "Add credits system, Stripe/SePay payments, premium skills, kits, and creator payouts to SkillX"
status: pending
priority: P1
effort: 40h
branch: main
tags: [monetization, payments, credits, stripe, sepay, kits]
created: 2026-02-25
---

# Premium Skills & Credits Marketplace

## Summary

Add monetization layer to SkillX: internal credits ledger, Stripe + SePay payment integration, premium skill gating, kits (collections), search personalization for owned content, and creator payouts via Stripe Connect.

Revenue model: 85/15 split (creator/platform). Credits: 1 credit = $0.01 USD, integer math only.

## Phases

| # | Phase | Effort | Status | Depends On |
|---|-------|--------|--------|------------|
| 1 | [Database & Credits Ledger](./phase-01-database-credits-ledger.md) | 5h | pending | — |
| 2 | [Stripe Integration](./phase-02-stripe-integration.md) | 8h | pending | P1 |
| 3 | [SePay Integration](./phase-03-sepay-integration.md) | 4h | pending | P1 |
| 4 | [Premium Skill Usage Flow](./phase-04-premium-skill-usage-flow.md) | 6h | pending | P1 |
| 5 | [Kits (Collections)](./phase-05-kits-collections.md) | 5h | pending | P1 |
| 6 | [Search Personalization](./phase-06-search-personalization.md) | 4h | pending | P1, P5 |
| 7 | [Creator Dashboard & Payouts](./phase-07-creator-dashboard-payouts.md) | 8h | pending | P1, P2, P4 |

## Key Decisions

- Credits stored as integers (cents). No floats anywhere in money path.
- `credit_cost` on skills table = credits per install/use. Set by author, capped at 10,000 server-side.
- Existing `is_paid`/`price_cents` columns repurposed: `is_paid` = has credit_cost > 0, `price_cents` = display price (informational).
- Kits = free tagging/collection feature. No monetization yet.
- Stripe webhooks verify signature. SePay webhooks verify shared secret + DB-stored order lookup.
- Credit deductions use atomic `UPDATE WHERE balance >= cost` (NOT check-then-deduct).
- Purchases tracked in `skill_purchases` table (NOT installs table).
- Topup orders stored in `topup_orders` table — webhooks use DB-stored amounts, not metadata.
- Creator earnings are NOT spendable credits — held in `creator_earnings` until Stripe payout.
- SePay orders expire after 24h.

## Red-Team Review

[Full review](./reports/red-team-review.md) — all CRITICAL and HIGH issues addressed in phase files.

## New Routes

- `POST /api/credits/topup` — create Stripe checkout session
- `POST /api/credits/topup/sepay` — create SePay payment
- `POST /api/webhooks/stripe` — Stripe webhook handler
- `POST /api/webhooks/sepay` — SePay webhook handler
- `GET /api/credits/balance` — user credit balance + recent txns
- `CRUD /api/kits/*` — kit management
- `GET /api/creator/earnings` — creator earnings dashboard data
- `POST /api/admin/payouts` — trigger monthly payout batch

## New Env Vars

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`
- `SEPAY_API_KEY`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_ACCOUNT`
- `APP_URL` (for Stripe success/cancel redirects)
