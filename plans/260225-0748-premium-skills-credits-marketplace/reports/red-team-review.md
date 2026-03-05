# Red-Team Review: Premium Skills & Credits Marketplace

**Date:** 2026-02-25
**Verdict:** Do not implement as-is. Critical race conditions and security holes will cause real financial losses.

---

## 1. CRITICAL: Race Conditions — Double-Spend Is Certain

### The plan acknowledges this and accepts it. That is unacceptable for a money system.

The "pseudo-transaction via D1 batch" pattern in `credit-ledger.ts`:
```
1. Check balance >= cost
2. INSERT credit_transaction
3. UPDATE credit_balances SET balance = balance - cost
```

D1 batch is NOT a transaction. It executes statements sequentially but does NOT lock rows between steps. Two concurrent requests (CLI + web, or two CLI tabs) BOTH pass step 1 with balance = 500, BOTH deduct 500, user ends at -500. The plan says "accept for MVP." This is real money — a user who purchased credits can lose them twice to one skill.

**Fix:** Use D1's `WITH` CTE or subquery to make the deduction atomic:
```sql
UPDATE credit_balances
SET balance = balance - ?
WHERE user_id = ? AND balance >= ?
```
Then check `changes()` — if 0 rows updated, balance was insufficient. No separate SELECT needed. This is the only safe pattern on D1 without true transactions.

The plan never mentions this pattern. The proposed "check then deduct" in `deductCredits()` is fundamentally broken under concurrency.

---

## 2. CRITICAL: SePay Description Injection — Credit Theft

Phase 3: transfer description format `"SKILLX {userId} {packId} {orderId}"`.

If `userId` or `packId` contains spaces (e.g., a user manipulates their profile or packId is user-supplied), the parsing splits wrong. Worse: there is NO signature on the transfer description — it's just text the user's bank sends. An attacker can:
1. Open a SePay topup request for Pack A (500 credits, $5)
2. Reuse the transfer description from a previous orderId for Pack B (5000 credits, $40) by crafting a manual bank transfer with a recycled description
3. The webhook just checks orderId idempotency — if orderId is "used," it skips. But if the attacker uses a NEW orderId format that matches parsing, they craft arbitrary credit amounts

Deeper problem: **the SePay webhook verifies only a shared secret header**. If that secret leaks (env var exposure, log, etc.), anyone can POST fake webhook events and mint unlimited credits. There is no secondary verification against an actual SePay API call to confirm the transfer.

**Fix:**
- After receiving SePay webhook, call SePay's API to independently verify the transaction ID exists and matches expected amount
- Never derive credit amount from parsed description — look up the pending order by orderId in DB and use the stored pack amount
- Store pending orders in DB (not just description string) with amount, userId, packId locked at creation time

---

## 3. CRITICAL: `hasPurchased()` Uses Wrong Table

Phase 4: `hasPurchased(db, userId, skillId)` checks the `installs` table.

The `installs` table currently tracks CLI installs identified by `X-Device-Id` (a cookie/header), NOT by authenticated user. Free skills don't require auth for install. So:
- A user can install a free skill without auth → installs record exists with device ID, no user_id
- The plan's purchase check assumes installs = purchase, but the table schema may not have user_id on all records
- After purchasing, the insert into installs may conflict with existing anonymous install record

More critically: the plan never specifies a separate `purchases` table. Purchases and installs are conflated. What if a user installs a skill on machine A (logged in), then wants to use it on machine B? Do they pay again? The plan says "check installs table" but doesn't address multi-device.

**Fix:** Add a dedicated `skill_purchases` table keyed on `(user_id, skill_id)`. Decouple purchase from install.

---

## 4. HIGH: Creator Can Set Arbitrary `credit_cost`

Phase 4: "`credit_cost` on skills table. Set by author."

No mention of validation, caps, or moderation. A creator sets `credit_cost = 999999`. User installs it, pays 999999 credits. There is no:
- Maximum credit_cost enforced server-side
- Admin review/approval flow for premium skills
- Way to flag price abuse

Similarly: a creator can change `credit_cost` AFTER users have purchased. User paid 100 credits when price was 100, price is now 500 — what happens on re-install? The `hasPurchased()` check bypasses re-charge, but the UI will show the new price, misleading new buyers.

**Fix:** Cap credit_cost server-side (e.g., max 10,000). Log price changes in an audit table. Add `purchased_at_price` to the purchase record.

---

## 5. HIGH: Stripe Checkout Metadata Is Server-Set but Not Verified on Webhook

Phase 2, step 5: extract `userId, credits` from `session.metadata`.

The plan correctly notes "Checkout session metadata is server-set, user cannot tamper." True. But the webhook handler trusts metadata blindly without re-validating against the actual pack definition. If a bug or future code change creates a checkout session with wrong credit count in metadata, the webhook will happily credit the wrong amount. There's no canonical record of "this session should grant X credits."

**Fix:** Store `{ sessionId, userId, packId, credits, status: pending }` in DB when creating checkout. On webhook, look up by sessionId — use the DB-stored credits, not metadata. Metadata becomes a hint only.

---

## 6. HIGH: Payout Processor Deducts from `credit_balance` — Wrong

Phase 7, `executePayoutBatch()`: "Deduct from creator's credit_balance (convert to real money via Stripe)"

Creator's pending earnings are in `creator_earnings` table (status: pending). The plan also credits them to `credit_balances`. On payout, it deducts from `credit_balance`. This means:
- Creator can SPEND their unpaid earnings as credits before payout (credits are spendable)
- Payout batch tries to pay out earnings that the creator already consumed
- `creator_earnings.status` says pending, but actual balance is lower

The two systems (spendable credit balance + payout earnings) are not reconciled. The plan never addresses this.

**Fix:** Separate creator's spendable balance from their payout-eligible earnings. Earnings stay in `creator_earnings` only until paid out — they do NOT automatically become spendable credits. Add explicit "withdraw to balance" action if that's desired.

---

## 7. HIGH: Admin Payout Endpoint Has No Idempotency

Phase 7: `POST /api/admin/payouts` triggers `calculatePayoutBatch()` then `executePayoutBatch()`.

If admin clicks twice, or the first request times out mid-batch (CF Worker 30s CPU limit), the second run re-processes already-transferred earnings. Stripe transfers are idempotent with idempotency keys, but the plan doesn't mention using them. DB records may be partially updated (some earnings marked paid, others not), then re-processed.

**Fix:** Create `payout_batch` record FIRST with a unique ID, mark status `processing`. Subsequent calls check if an active batch exists. Use Stripe idempotency key = `batch_id + creator_id`.

---

## 8. HIGH: SePay QR Polling Has No Timeout/Expiry

Phase 3: "Waiting for confirmation... polling" on the frontend.

The pending SePay order has no expiry. A user can generate a QR, close the tab, then send the bank transfer 6 months later. Webhook fires, orderId is new, credits are added — for a price that may have changed. There's no order expiration.

**Fix:** Store order expiry timestamp (e.g., 24h). Webhook rejects transfers for expired orders.

---

## 9. MEDIUM: `author_user_id` Null = Platform Keeps 100% — Exploitable

Phase 4: "If `author_user_id` is null (seeded skills), platform keeps 100% until claimed."

There are 133K seeded skills. Any of them can be marked premium with `credit_cost > 0` by... whom? The plan doesn't specify who can set `credit_cost` on seeded skills. If it's admin-only, fine. If any registered user can "claim" a skill and set a price, that's fraud (charging for someone else's free tool).

The claim flow is mentioned as "add later" but the revenue implication is immediate.

---

## 10. MEDIUM: D1 Limitations Not Respected

The plan assumes D1 batch = pseudo-transaction. D1 batches execute in a single HTTP round-trip but SQLite still processes them sequentially without row-level locking across statements. Under CF's multi-region replication, a write on region A may not be visible to a concurrent read on region B for up to ~150ms.

Phase 1 risk section says "worst case: double-deduct on concurrent requests. Accept for MVP." This is not an acceptable risk when real money is involved. The atomic UPDATE pattern (check-and-decrement in one statement) is the correct fix and is not significantly harder to implement.

---

## 11. MEDIUM: No Refund Flow Defined Anywhere

The transaction types include `refund` but zero phases cover:
- How refunds are triggered (user request? automatic on error?)
- Who authorizes refunds (admin only? creator?)
- What happens to the 85% creator earnings on refund (clawback?)
- Stripe refunds vs. credit refunds (different flows)
- What's the refund window?

This will become the first support ticket after launch.

---

## 12. MEDIUM: Creator Account Deletion — Earnings Orphaned

Phase 5 mentions "orphan kits if author deletes account" as future work. Same problem exists for:
- `creator_earnings` records → no creator to pay out
- `credit_balances` for creator → lost credits
- `skills.author_user_id` → null, 100% to platform forever
- Pending payout batch referencing deleted Stripe Connect account → Stripe transfer fails

No cascade or archival strategy defined.

---

## 13. LOW: Search Personalization Breaks KV Cache

Phase 6 adds per-user affinity to search. But `api.search.ts` currently caches results in KV with a key based on query text. Adding userId to the boost means the same query returns different results per user — but the cache key must include userId or results will be wrong (user A's personalized results served to user B).

The plan modifies `hybrid-search.ts` to accept userId but doesn't update the cache key. This is a correctness bug, not just a performance issue.

**Fix:** If userId present, either bypass cache entirely or key on `query + userId`. Anonymous searches remain cached as-is.

---

## 14. LOW: Stripe Connect Express vs. Standard Not Decided

Phase 7 uses "Express accounts" without justification. Express gives Stripe more control over the UX and limits payout customization. For a global marketplace with Vietnamese creators who also use SePay, Express may not be available. Standard accounts offer more flexibility but require more onboarding work. This decision affects legal agreements (who owns the merchant relationship?), tax reporting obligations, and which countries are supported.

---

## Summary of Required Fixes Before Implementation

| Priority | Issue | Fix |
|----------|-------|-----|
| CRITICAL | D1 race condition / double-spend | Atomic UPDATE with balance >= cost check |
| CRITICAL | SePay description injection | Verify via SePay API; lock amount at order creation |
| CRITICAL | hasPurchased() uses wrong table | Separate `skill_purchases` table |
| HIGH | Unbounded credit_cost | Server-side cap + audit log |
| HIGH | Webhook credits trusted from metadata | Store expected credits in DB at checkout creation |
| HIGH | Payout consumes spendable balance incorrectly | Separate payout earnings from spendable balance |
| HIGH | Payout has no idempotency | Create batch record first, use Stripe idempotency keys |
| HIGH | SePay orders never expire | Add expiry timestamp, reject expired orders in webhook |
| MEDIUM | Who claims seeded skills + sets price | Define claim flow before enabling premium pricing |
| MEDIUM | No refund flow | Define before launch |
| MEDIUM | Creator deletion orphans | Define cascade/archival strategy |
| MEDIUM | Search cache broken by personalization | Include userId in cache key or bypass |

---

## Unresolved Questions

1. Can ANY authenticated user set `credit_cost` on a skill they registered, or is there an approval gate?
2. What is the refund policy? Who pays — platform absorbs or creator clawback?
3. Are creator earnings spendable as credits, or held separately until payout?
4. How does multi-device access work after purchase (machine A bought it, machine B tries to install)?
5. What happens to in-flight purchases if a skill's `credit_cost` changes mid-transaction?
6. Is there a KYC/AML requirement for payouts (especially VN creators receiving Stripe transfers)?
