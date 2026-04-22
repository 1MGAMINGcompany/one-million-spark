
## Fix free-code activation error and confusing “Activate for Free” state

### What I found

The free-code failure is not because `BESTRONG` is invalid.

`BESTRONG` is still available:

```text
code: BESTRONG
discount_type: full
discount_value: 2400
uses_count: 0
max_uses: 1
```

The backend log shows the real failure:

```text
[operator-manage] full-discount activation failed operator_lookup_failed
```

The affected Privy user currently has multiple operator rows:

```text
did:privy:cmlqvouen00te0clhp5wog5ke
- demo
- myworld
```

Several backend paths use `.maybeSingle()` or `.single()` for `operators where user_id = ...`. That fails when a user has more than one operator record, so the free activation returns:

```text
Your account could not be activated. Please contact support.
```

The button still appears because the frontend keeps the valid promo-code state after the failed backend response. That makes the UI look like the code worked but activation failed.

---

## Patch

### File 1: `supabase/functions/operator-manage/index.ts`

Make operator lookup tolerant of duplicate historical operator rows.

#### Change 1: Add a canonical operator lookup helper

Add a helper that fetches all operators for the current Privy DID and chooses one deterministic row instead of using `.maybeSingle()`.

Priority:

1. active configured operator
2. active pending operator
3. newest pending operator
4. newest operator row

This prevents duplicate existing rows from crashing activation.

Example behavior:

```text
user has demo + myworld
→ backend chooses one canonical active operator
→ activation can continue instead of failing operator_lookup_failed
```

#### Change 2: Use the helper in purchase activation

Update `activatePurchasedOperator()` so it no longer calls:

```ts
.eq("user_id", privyDid).maybeSingle()
```

Instead, use the canonical helper.

The function should still:
- activate the selected operator
- create/upsert `operator_settings`
- return success only after critical writes succeed

#### Change 3: Use the helper in related operator routes

Replace fragile `.single()` / `.maybeSingle()` lookups for the current user in:

- `get_my_operator`
- `create_operator`
- `update_operator`
- `update_settings`

This prevents the same duplicate-row bug from breaking dashboard, onboarding, and settings.

#### Change 4: Keep duplicates, but avoid breaking on them

No deletion is required for the duplicate historical rows. The code should handle them safely.

Optional log:

```text
[operator-manage] multiple operators found for user; selected canonical operator
```

---

### File 2: `src/pages/platform/PurchasePage.tsx`

Improve the free-code UX so the screen does not look contradictory.

#### Change 1: Track activation-specific state

Add a separate state for free promo activation:

```ts
const [freeActivationFailed, setFreeActivationFailed] = useState(false);
```

Reset it when:
- promo code changes
- promo code is applied again
- activation starts

#### Change 2: Better free-code loading copy

For free activations, show:

```text
Activating free access...
```

not:

```text
Confirming on-chain...
```

because no blockchain transaction is happening.

#### Change 3: Better retry state after failure

If a valid full-discount code is applied and activation fails, show the CTA as:

```text
Retry Free Activation
```

instead of continuing to show the same untouched:

```text
Activate for Free
```

Also keep the error box visible with the backend message.

#### Change 4: Map backend stages to clearer messages

Add mappings for backend activation stages:

```text
operator_lookup_failed → We found more than one operator account for this login. Retrying will use your primary account.
settings_creation_failed → Your account was activated, but settings could not be created. Please try again.
promo_usage_update_failed → Your account was activated, but the promo could not be recorded. Please contact support.
```

After the backend duplicate-operator fix, the first message should no longer appear for this user.

---

### File 3: `src/pages/platform/PlatformApp.tsx`

Update `RequireActiveOperator` so it does not use `.maybeSingle()` against operators by `user_id`.

Current issue:

```ts
.from("operators")
.select("status")
.eq("user_id", did)
.maybeSingle()
```

This can fail for users with multiple operator rows.

Replace it with a list query ordered by `created_at desc`, then treat the user as active if any canonical/current operator is active.

This keeps onboarding and dashboard access from failing after the free-code activation succeeds.

---

## Verification

### Backend verification

1. Apply `BESTRONG` again.
2. Confirm `operator-manage` no longer logs:

```text
operator_lookup_failed
```

3. Confirm the backend returns:

```json
{
  "success": true,
  "status": "active",
  "amount_charged": 0,
  "promo_code": "BESTRONG"
}
```

4. Confirm `BESTRONG` usage increments only after success.

### UI verification

1. Apply `BESTRONG`.
2. Confirm price changes to `FREE`.
3. Click activation.
4. Confirm the button says:

```text
Activating free access...
```

5. Confirm no wallet transaction opens.
6. Confirm success redirect:

```text
/operator-purchase-success?amount=0&promo=BESTRONG
```

7. Confirm success page says access was activated.
8. Click “Start Setup”.
9. Confirm onboarding opens.
10. Confirm dashboard/app access does not break for a user with multiple historical operator rows.

---

## What will not be changed

- Treasury wallet
- USDC.e token contract
- Paid $2,400 purchase verification
- Partial-discount payment verification
- Sports feeds
- Trading
- Payouts
- Affiliate tracking
- Existing operator apps

## Expected result

`BESTRONG` should activate free access cleanly. Users with duplicate historical operator records should no longer see “Your account could not be activated,” and the purchase page should show a clear activation/retry state instead of a confusing generic “Activate for Free” button after failure.
