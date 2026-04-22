
## Quick buy-flow audit findings + hardening plan

### Direct answer: USDC.e or USDC?

Technically, the operator app purchase uses **Bridged USDC.e on Polygon**:

```text
Token contract: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
Network: Polygon
Treasury wallet: 0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d
```

For customers, the app correctly labels it as **USDC on Polygon**. Internally it is USDC.e, but the UI should keep saying **USDC** so buyers are not confused.

---

## Audit result

### 1. Free discount codes

Current available full/free codes include:

- `BESTRONG`
  - full discount
  - $2,400 discount
  - 0 uses
  - max 1 use
  - no expiry

The free-code flow now looks mostly correct:

- Buyer applies code
- Price becomes `FREE`
- No crypto transaction is requested
- Purchase page calls the backend activation flow
- Backend creates/activates the operator
- Backend creates default operator settings
- Promo usage is incremented only after activation
- Buyer is redirected to:

```text
/operator-purchase-success?amount=0&promo=BESTRONG
```

### 2. Partial discount codes

I found a current partial code:

- `50OFF`
  - percent discount
  - 50%
  - expected final price: `$1,200 USDC`

The partial-code flow is present, but should be hardened.

Current behavior:

- Buyer applies the code
- UI calculates discounted price
- Buyer sends discounted USDC amount
- Backend verifies the on-chain transfer amount
- Backend activates/creates operator

Main risk:

- The frontend uses `Math.ceil(effectivePrice)`
- The backend uses `Math.round(discountedPrice)`

For clean discounts like 50%, this is fine. But for future discount codes that create decimals, frontend/backend rounding could disagree. This should be standardized.

### 3. “5” code

I did not find a promo code literally named `5`.

Current recent promo codes are:

```text
BESTRONG
50OFF
V
JDBOXING
SILVERTOOTH
MYCODE
```

If “5” means a 5% or $5 discount code, that code does not currently appear in the database list I checked.

### 4. Full $2,400 paid flow

The full paid flow is structurally correct:

- Buyer must be signed in
- Buyer clicks purchase
- App sends a Polygon token transfer
- Transfer goes to the treasury wallet
- Backend verifies the transaction receipt
- Backend checks the transfer is from the correct token contract
- Backend checks the recipient is the treasury wallet
- Backend checks the amount is at least `$2,400` with 6 decimals
- Operator account is activated after verification

Main hardening needed:

- Paid and partial paid flows do not check every database write as strictly as the free-code path now does.
- Paid/partial flows should also create default `operator_settings` immediately, just like the free-code flow.
- Paid/partial success responses should return consistent fields like `amount_charged`, `promo_applied`, and `promo_code`.

---

## Recommended patch

### File 1: `src/pages/platform/PurchasePage.tsx`

Update the purchase page to make all three paths consistent:

1. Free code:
   - Keep current no-transaction activation path.
   - Keep success redirect with `amount=0&promo=CODE`.

2. Partial discount:
   - Use one integer-safe amount calculation.
   - Send the exact discounted amount expected by the backend.
   - Navigate to success with:

```text
/operator-purchase-success?amount=1200&promo=50OFF&tx=...
```

3. Full $2,400 payment:
   - Keep sending USDC on Polygon to treasury.
   - Navigate to success with:

```text
/operator-purchase-success?amount=2400&tx=...
```

4. Improve error display:
   - Show clear messages for:
     - code already redeemed
     - transaction verification failed
     - insufficient USDC
     - activation failed after payment

### File 2: `supabase/functions/operator-manage/index.ts`

Harden paid and partial paid flows to match the free-code path.

Changes:

- Use integer-safe cents/USDC calculation for discounts.
- Keep verifying the Polygon transfer against:
  - USDC.e token contract
  - treasury wallet
  - required discounted amount
- Check every critical database write:
  - operator lookup
  - operator activation/update
  - new operator insert
  - default settings upsert
  - promo usage increment
  - referral attribution best-effort only
- Create `operator_settings` immediately for paid, partial, and free activations.
- Return consistent success JSON:

```json
{
  "success": true,
  "status": "active",
  "amount_charged": 2400,
  "promo_applied": false
}
```

or for discount:

```json
{
  "success": true,
  "status": "active",
  "amount_charged": 1200,
  "promo_applied": true,
  "promo_code": "50OFF"
}
```

### File 3: `supabase/functions/prediction-admin/index.ts`

Make promo validation use the same discount calculation rules as `operator-manage`.

This prevents the UI from showing one discounted price while the backend expects another.

### File 4: `src/pages/platform/OperatorPurchaseSuccess.tsx`

Keep the current free-code copy, and add accurate paid/discount copy:

- Free code:

```text
Access activated. Your free operator app access is ready.
```

- Partial discount:

```text
Discounted payment confirmed. Let’s set up your branded predictions app.
```

- Full payment:

```text
Payment confirmed. Let’s set up your branded predictions app.
```

---

## Verification plan

### Free code

Test with `BESTRONG` or another unused full-discount code:

1. Apply promo code.
2. Confirm price changes to `FREE`.
3. Confirm no wallet transaction opens.
4. Confirm success page opens.
5. Confirm onboarding opens.
6. Confirm operator account is active.

### Partial discount

Test with `50OFF`:

1. Apply promo code.
2. Confirm price changes to `$1,200`.
3. Confirm wallet transaction sends `$1,200 USDC` on Polygon.
4. Confirm backend verifies the transaction.
5. Confirm success page opens with discounted-payment copy.
6. Confirm operator account is active.

### Full price

Test without a promo code:

1. Confirm price is `$2,400`.
2. Confirm wallet transaction sends `$2,400 USDC` on Polygon.
3. Confirm backend verifies treasury receipt.
4. Confirm success page opens with normal paid copy.
5. Confirm operator account is active.

---

## What will not be changed

- Treasury wallet address
- Token contract
- Wallet provider
- Operator dashboard
- Operator app trading
- Sports feeds
- Payout logic
- Affiliate tracking
- Existing active operators

---

## Expected outcome

The buy flow will support all three cases cleanly:

```text
Free code → no crypto payment → account activated
Partial code → discounted USDC payment → account activated
No code → full $2,400 USDC payment → account activated
```

The crypto used remains **Bridged USDC.e on Polygon internally**, displayed to buyers as **USDC on Polygon**.
