

## Admin-Only Referral Code Issuance

Currently, the `referral-bind` edge function auto-generates referral codes for users, and any user with a code can refer others. You want to change this so that **only you (admin) can issue referral codes** via the admin panel, assigning them to a wallet address with an optional label/name.

### Changes

#### 1. New Edge Function: `supabase/functions/referral-admin-set-code/index.ts`
- Accepts `{ adminWallet, targetWallet, customCode, label }` 
- Validates `adminWallet` is in `prediction_admins` table
- Validates `customCode` is unique, 4-16 chars, alphanumeric
- Upserts `player_profiles` row: sets `referral_code` on the target wallet
- Stores the optional `label` (e.g. influencer name) — requires a new column

#### 2. Database Migration
- Add `referral_label` column to `player_profiles` (nullable text) — stores a friendly name like "NinjaStreamer" for admin reference
- Remove the auto-generate trigger if one was added (currently none exists, so no action needed)

#### 3. Update `referral-bind` Edge Function
- Remove the `generateReferralCode()` call on line 76-77 — new users who get referred should NOT auto-receive their own code
- Only bind the referral (set `referred_by_wallet`, `referred_by_code`) without giving the referred user a code
- A user can only become a referrer if admin explicitly issues them a code

#### 4. Update `src/pages/ReferralAdmin.tsx`
- Add an "Issue Referral Code" section at the top:
  - Input for **wallet address** (Solana pubkey)
  - Input for **custom code** (e.g. "NINJA", "STREAMER1")
  - Input for **label/name** (optional, e.g. "John's Gaming Channel")
  - Submit button that calls the new edge function
  - Success/error feedback via toast
- Add a section showing all issued codes (query `player_profiles` where `referral_code IS NOT NULL`)

#### 5. Update `src/components/ReferralSection.tsx`
- Keep as-is — it already gracefully returns `null` if the user has no `referral_code`
- Users without an admin-issued code simply won't see the referral section
- Users WITH a code see their stats, copy link, share button as before

### Flow Summary
```text
Admin Panel                  User Experience
───────────                  ───────────────
Admin enters wallet +    →   Code saved to player_profiles
custom code + label

                             User visits ?ref=CODE
                             referral-bind validates code
                             Binds referred_by_wallet
                             Does NOT give new user a code

                             Only admin-issued users can refer
```

### Files Changed
- `supabase/functions/referral-admin-set-code/index.ts` (new)
- `supabase/functions/referral-bind/index.ts` (remove auto-code generation)
- `src/pages/ReferralAdmin.tsx` (add issue code UI)
- 1 migration (add `referral_label` column)

