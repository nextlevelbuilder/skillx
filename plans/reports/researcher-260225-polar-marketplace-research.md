# Polar.sh Marketplace Research Report

**Date:** 2026-02-25
**Purpose:** Evaluate Polar.sh for SkillX marketplace use case (platform facilitating skill transactions between CLI users and skill creators)

---

## 1. Marketplace-Style Integrations (Platform Facilitating Third-Party Transactions)

**Verdict: PROHIBITED by Polar's acceptable use policy.**

Polar explicitly bans:
> "Selling others' products or services using Polar against an upfront payment or with an agreed upon revenue share."

Polar is a **Merchant of Record (MoR)** — it handles taxes, compliance, and disputes on behalf of a single seller. This model fundamentally breaks when unknown third-party sellers are involved, because Polar cannot verify or manage fulfillment obligations between arbitrary parties.

**No exceptions or workarounds** are documented. They suggest contacting support for edge cases, but the restriction appears firm and structural, not just policy.

---

## 2. Credits / Balance Topup Model

**Verdict: YES — fully supported as a first-class feature.**

Polar has a dedicated Credits system under its Usage-Based Billing feature:

- Customers **prepay** for usage; credits are deducted from a Usage Meter balance
- If balance hits 0, overage billing kicks in (or you can disable overage entirely for pure prepaid)
- Credits can be issued per billing cycle (subscriptions) or as a one-time purchase
- Balance visible via **Customer State API** and **Customer Meters API**

**Caveat:** Polar does NOT enforce spending limits automatically. Your app must check balance and gate usage.

This maps well to "buy X credits, use them for AI skill calls" patterns.

---

## 3. Supported Payment Models

| Model | Supported |
|-------|-----------|
| One-time purchase | Yes |
| Subscriptions (monthly/yearly) | Yes |
| Usage-based billing (metered) | Yes |
| Pay-what-you-want | Yes |
| Credits / prepaid balance | Yes |
| Free tier / freemium | Yes |
| Coupons / discounts | Yes |

Polar supports LLM token billing, API call metering, bandwidth metering natively with "Ingestion Strategies" (S3, etc.).

---

## 4. APIs for Programmatic Product Creation, Checkout, Webhooks

**Verdict: YES — solid developer-first API.**

- **Checkout API:** `polar.checkouts.create({ products: ["productId"] })` — returns session URL for redirect
- **Customer linkage:** Pass `external_customer_id` at checkout; Polar creates and tracks the customer
- **Webhook support:** 25+ granular events (`onOrderPaid`, `onCustomerStateChanged`, etc.) with built-in SDK validation (`validateEvent`)
- **SDKs:** TypeScript (`@polar-sh/sdk`), PHP (via Packagist), community wrappers
- **Frameworks:** Native adapters for Next.js, Express, Better Auth integration documented

Docs: https://docs.polar.sh/features/checkout/session

---

## 5. Fees / Commission Structure

**Standard tier only (no monthly fee):**

| Fee Type | Amount |
|----------|--------|
| Base transaction fee | 4% + $0.40 |
| International cards (non-US) | +1.5% |
| Subscription payments | +0.5% |
| Dispute/chargeback | $15 flat (regardless of outcome) |
| Payout (Stripe, no Polar markup) | $2/mo active + 0.25% + $0.25/payout |
| Cross-border payout | 0.25% (EU), up to 1% (other countries) |

Polar absorbs Stripe's base 2.9% + 30¢ within their 4% + 40¢. Claims 20% cheaper than other MoR alternatives (LemonSqueezy, Paddle, etc.).

Custom pricing available for high-volume users.

---

## 6. Multi-Party Payouts (Platform Cut + Creator Payout)

**Verdict: NOT SUPPORTED. Prohibited by policy.**

Polar has no split-payout mechanism. It is designed for a single seller (you) receiving funds. There is no concept of:
- Platform fee + creator payout
- Revenue sharing with third-party sellers
- Sub-accounts or connected accounts (Stripe Connect model)

If SkillX wanted to pay skill creators a revenue share from purchases, Polar cannot facilitate this natively. You would need to:
1. Receive full payment via Polar into your account
2. Manually calculate creator share
3. Pay out creators via a separate system (bank transfer, Stripe, etc.)

This is operationally viable but legally/tax-wise complex — you'd be receiving income and redistributing it yourself.

---

## 7. Polar vs Stripe Connect for Marketplace Use Cases

| Dimension | Polar | Stripe Connect |
|-----------|-------|---------------|
| Marketplace support | **No (prohibited)** | **Yes (core feature)** |
| Multi-party payouts | No | Yes (Express/Custom accounts) |
| Platform fee deduction | No | Yes (application_fee_amount) |
| Seller onboarding | No | Yes (Connect OAuth) |
| Tax compliance (MoR) | Yes (fully handled) | No (you handle taxes) |
| Usage-based billing | Yes (built-in) | Via Stripe Billing (complex setup) |
| Credits/prepaid | Yes | Via Stripe Billing (DIY) |
| Setup complexity | Low | High |
| Transaction fee | 4% + 40¢ (all-in) | 2.9% + 30¢ + platform overhead |
| Developer ergonomics | High (purpose-built) | Good but verbose |
| Open source | Yes | No |

**Summary:** Stripe Connect is the correct tool for marketplace multi-party payouts. Polar wins for single-seller SaaS/software monetization with lower complexity, built-in MoR tax handling, and simpler billing primitives.

---

## Recommendation for SkillX

SkillX has two possible monetization models:

**Option A: Platform-owned skills (Polar viable)**
- SkillX owns all skill IP and charges users directly for `skillx use`
- Creators contribute skills, SkillX pays them separately (manual/contract-based)
- Polar handles billing: credits topup, usage metering, subscriptions
- Simple, fast to ship, Polar's sweet spot

**Option B: Creator marketplace (Stripe Connect required)**
- Creators publish skills and receive per-use revenue minus SkillX cut
- Requires Stripe Connect or similar (Polar explicitly prohibited)
- Much higher operational complexity: creator onboarding, KYC, tax forms, split payouts
- Not feasible with Polar

Given SkillX's current stage, **Option A with Polar is the pragmatic path.** Creator payouts can be handled off-platform initially (GitHub Sponsors, manual invoicing).

---

## Unresolved Questions

1. **Polar policy exception:** Could Polar make a custom exception for a curated marketplace where SkillX acts as the legal seller (MoR) and creators are contractors? Not documented, would need direct inquiry.
2. **Usage metering granularity:** Can Polar meter at per-skill-execution level with dynamic pricing per skill (different credits cost per skill)? Docs suggest yes via multiple meters, but needs verification.
3. **Polar stability for production:** Polar is post-beta but relatively young (~$10M ARR milestone recently). Risk tolerance for a growing platform's API stability?

---

## Sources

- [Polar Pricing](https://polar.sh/resources/pricing)
- [Credits – Polar Docs](https://polar.sh/docs/features/usage-based-billing/credits)
- [Checkout API – Polar Docs](https://docs.polar.sh/features/checkout/session)
- [Acceptable Use – Polar](https://polar.sh/docs/merchant-of-record/acceptable-use)
- [Polar vs Stripe Comparison](https://polar.sh/resources/comparison/stripe)
- [Stripe vs Polar.sh – Buildcamp](https://www.buildcamp.io/blogs/stripe-vs-polarsh-which-payment-platform-is-best-for-your-saas/)
- [Payment Fees Compared – UserJot](https://userjot.com/blog/stripe-polar-lemon-squeezy-gumroad-transaction-fees)
- [@polar-sh/sdk – npm](https://www.npmjs.com/package/@polar-sh/sdk)
- [Polar Review – Dodo Payments](https://dodopayments.com/blogs/polar-sh-review)
