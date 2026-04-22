
## Fix BESTRONG free-code purchase redirect error

### What I confirmed

- The `BESTRONG` promo code exists in the database.
- It is a full-discount code:
  - `discount_type = full`
  - `discount_value = 2400`
  - `uses_count = 0`
  - `max_uses = 1`
  - no expiry
- The purchase page correctly treats a full discount as `$0 / FREE`.
- The risk is in the free-code activation path after clicking the purchase button:
  - `PurchasePage.tsx` calls `operator-manage` directly.
  - `operator-manage` creates or activates the operator account.
  - The current backend path does not fully check database write errors before returning success.
  - The success/onboarding redirect path can therefore land the user on a broken or confusing error state if activation did not complete cleanly.

## Patch

### File 1: `supabase/functions/operator-manage/index.ts`

Harden the `confirm_purchase` full-discount branch.

Changes:
- Validate the promo code as it already does.
- For full-discount codes, activate the operator without requiring a transaction hash.
- Check every database write result:
  - promo usage update
  - existing operator activation
  - new operator insert
  - default operator settings creation
  - referral attribution
- If any required write fails, return a clear JSON error instead of silently continuing.
- When a new operator is created from a free code, also create default `operator_settings` immediately so the account is fully usable before onboarding.
- Add safe logs for:
  - promo applied
  - operator activated
  - operator created
  - activation failure reason

This prevents a free promo from appearing successful while the operator record is incomplete.

### File 2: `src/pages/platform/PurchasePage.tsx`

Improve the free-code success flow.

Changes:
- Keep the existing “FREE” promo UI.
- For `effectivePrice === 0`, call the backend activation path and handle JSON errors clearly.
- If activation succeeds, navigate to:

```text
/operator-purchase-success?amount=0&promo=BESTRONG
```

- If activation fails, show a readable on-page message such as:
  - “Promo activation failed. Please try again.”
  - “This code has already been redeemed.”
  - “Your account could not be activated. Please contact support.”

This avoids redirecting the user to a generic error page.

### File 3: `src/pages/platform/OperatorPurchaseSuccess.tsx`

Make the success page accurate for free-code purchases.

Changes:
- Detect `amount=0` or `promo=BESTRONG`.
- Show free-code copy instead of “Payment confirmed”:

```text
Access activated.
Your free operator app access is ready. Let’s set up your branded predictions app.
```

- Keep the same “Start Setup” button.
- Preserve normal paid-purchase copy for $2,400 payments.

### Optional safety check: promo usage

If needed after testing, verify `BESTRONG` still has the intended availability:

```sql
select code, discount_type, uses_count, max_uses, expires_at
from promo_codes
where code = 'BESTRONG';
```

Only adjust usage if the code was consumed by a failed activation attempt.

## Verification after implementation

1. Apply `BESTRONG` on the 1mg.live purchase page.
2. Confirm the price changes from `$2,400` to `FREE`.
3. Click the purchase/activation button.
4. Confirm no crypto transaction is requested.
5. Confirm the user lands on the success page, not an error page.
6. Confirm the success page says free access was activated.
7. Click “Start Setup”.
8. Confirm onboarding opens normally.
9. Finish onboarding and confirm the operator app is created.
10. Confirm the operator can go to dashboard and app normally.

## What is not touched

- Paid $2,400 USDC purchase flow
- Treasury wallet address
- Wallet creation
- Payouts
- Trading
- Sports/event feeds
- Affiliate tracking
- Operator dashboard logic
- Existing paid operators

## Expected result

Using `BESTRONG` should activate operator access immediately, redirect to a clean success page, and allow the user to start setup without seeing a generic error page.
