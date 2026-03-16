

## Audit Results: 4 Production Safety Checks

### 1. Reward calculation is HARDCODED at 20% -- CONFIRMED BUG

**File:** `supabase/functions/settle-game/index.ts` (line 1075)
```
const referralRewardBps = 2000; // 20% of platform fee
```

The settle-game function fetches `referred_by_wallet` from `player_profiles` but does NOT fetch `referral_percentage`. It uses a hardcoded 2000 bps (20%) for all referrers regardless of their assigned percentage.

**Fix:** In the settle-game function:
- Change the `player_profiles` select from `"referred_by_wallet"` to `"referred_by_wallet, referral_percentage"`
- Look up the **referrer's** profile to get their `referral_percentage` (the current query fetches the *referred player's* profile, not the referrer's)
- Replace `referralRewardBps = 2000` with `referralRewardBps = (referrerProfile.referral_percentage || 20) * 100`

Note: `prediction-submit` and `prediction-settle-worker` do NOT have referral reward logic, so no changes needed there.

---

### 2. Existing codes have sane default -- OK

The migration set `DEFAULT 20` on `referral_percentage`. All existing rows already have `referral_percentage = 20`. The admin UI and totals computation work correctly with this default. No fix needed.

---

### 3. Double-click payout protection -- NEEDS FIX

The `ReferralAdmin.tsx` UI does disable the button via `disabled={submittingPayout}`, which prevents most double-clicks. However, the edge function `referral-admin-record-payout` has zero server-side deduplication. Two rapid requests will create two identical payout records.

**Fix (UI-side, minimal):**
- Already handled by `submittingPayout` state disabling the button. This is adequate for admin tooling.
- Optional improvement: close the modal immediately on success (already done via `setPayoutOpen(false)`).

No server-side dedup needed for an admin-only tool used by one person, but worth noting.

---

### 4. Admin auth is INCONSISTENT -- CONFIRMED ISSUE

Three auth paths:
- **ReferralAdmin.tsx (client):** checks `prediction_admins` table OR hardcoded `ADMIN_WALLETS` array
- **referral-admin-set-code:** checks `prediction_admins` table ONLY (no hardcoded fallback)
- **referral-admin-record-payout:** checks `prediction_admins` table ONLY (no hardcoded fallback)

If the admin wallet is only in the hardcoded `ADMIN_WALLETS` but not in `prediction_admins`, the UI will show the admin dashboard but all edge function calls will fail with "not_admin".

**Fix:** Remove the `ADMIN_WALLETS` hardcoded fallback from `ReferralAdmin.tsx` so it relies solely on `prediction_admins`, matching both edge functions. (Or add the same fallback to the edge functions, but DB-only is cleaner.)

---

### 5. Summary cards at top -- ALREADY EXISTS

The current `ReferralAdmin.tsx` already has summary cards showing Total Referred, Total Earned, and Total Paid. No change needed.

---

## Plan

### Step 1: Fix settle-game referral percentage (critical)
- In `supabase/functions/settle-game/index.ts` lines 1075-1086:
  - After finding `referred_by_wallet`, fetch the **referrer's** `referral_percentage` from `player_profiles`
  - Use `referralRewardBps = (referrerPercentage || 20) * 100` instead of hardcoded 2000

### Step 2: Fix admin auth consistency
- In `src/pages/ReferralAdmin.tsx` line 61: remove the `ADMIN_WALLETS` constant
- In the `fetchData` function: remove the `|| ADMIN_WALLETS.includes(address)` fallback so admin check is `prediction_admins` only, matching edge functions

### Step 3: Add "Total Unpaid" to summary
- Add a 4th summary card showing `Total Unpaid = Total Earned - Total Paid` for quick reconciliation

These are minimal, safe changes with no impact on wallet, Solana, or gameplay logic.

