# Phase 3: SePay Integration (Vietnam)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 4h
- **Depends on:** Phase 1

SePay VietQR bank transfer for Vietnamese users. Alternative payment path for credit topups.

## Requirements

### Functional
- User selects SePay → gets VietQR code with structured transfer description
- SePay webhook confirms bank transfer → credits added
- Same credit packs as Stripe (VND pricing)

### Non-functional
- Webhook secret verification
- Idempotent processing
- VND to credits conversion at fixed rate (configurable)

## Architecture

```
User clicks "Buy (VN)" → POST /api/credits/topup/sepay
  → Generate transfer description: "SKILLX {userId} {packId} {orderId}"
  → Return QR code data (bank account + amount + description)
  → User scans QR, transfers via banking app
  → SePay detects transfer, sends webhook → POST /api/webhooks/sepay
  → Verify secret → Parse description → addCredits()
```

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/lib/sepay/sepay-client.ts` | CREATE — SePay API helpers |
| `apps/web/app/lib/sepay/sepay-types.ts` | CREATE — webhook payload types |
| `apps/web/app/routes/api.credits-topup-sepay.ts` | CREATE — generate QR transfer |
| `apps/web/app/routes/api.webhooks-sepay.ts` | CREATE — webhook handler |
| `apps/web/app/components/credits-topup-modal.tsx` | MODIFY — add SePay tab |

## Implementation Steps

1. Create `sepay-types.ts`:
   - SePay webhook payload interface
   - VND credit pack pricing (mirror USD packs)

2. Create `sepay-client.ts`:
   - `generateTransferInfo(userId, packId, orderId)` — returns bank account, amount (VND), description string
   - `verifyWebhookSecret(request, secret)` — check shared secret header

3. Create `api.credits-topup-sepay.ts`:
   - Require auth
   - Accept `{ packId }`
   - Generate unique order ID
   - Store pending order in credit_transactions (status tracking via description)
   - Return `{ bankAccount, amount, description, qrDataUrl }`

4. Create `api.webhooks-sepay.ts`:
   - Verify webhook secret from header
   - Extract orderId from transfer description
   - Look up pending order in DB by orderId — use **DB-stored** userId, packId, credits (never parse from description)
   - Verify transfer amount matches expected pack price in VND
   - Check order not expired (24h TTL from creation)
   - Idempotency check: skip if order already fulfilled
   - `addCredits(db, storedUserId, storedCredits, 'topup', orderId, 'SePay VietQR topup')`

5. Modify `credits-topup-modal.tsx`:
   - Add tab/toggle: "International (Stripe)" | "Vietnam (VietQR)"
   - VietQR tab shows QR code image + bank details + "Waiting for confirmation..." polling

6. Add env vars: `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_ACCOUNT`

## Todo List

- [ ] Create sepay-types.ts
- [ ] Create sepay-client.ts
- [ ] Create api.credits-topup-sepay.ts
- [ ] Create api.webhooks-sepay.ts
- [ ] Modify credits-topup-modal.tsx
- [ ] Configure env vars
- [ ] Test with SePay sandbox

## Success Criteria

- VietQR code displays with correct bank info
- Webhook correctly credits user after bank transfer
- Idempotent processing

## Risk Assessment

- **SePay description injection**: Never derive credit amount from description. Always look up pending order in DB by orderId. Description is only used to extract orderId.
- **Transfer amount mismatch**: Verify webhook amount matches DB-stored pack price. Reject mismatches.
- **Order expiry**: Pending orders expire after 24h. Webhook rejects expired orders.
- **Webhook secret leak**: If secret leaks, attacker can forge webhooks. Consider secondary verification via SePay API callback to confirm transaction exists.

## Security Considerations

- Webhook secret verification mandatory
- Never expose bank account details beyond what's needed for QR
- Rate limit QR generation endpoint
