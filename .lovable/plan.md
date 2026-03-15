

## Fix: Referral Admin Endless Spinner

### Problem
In `src/pages/ReferralAdmin.tsx` line 72, `fetchData()` returns early when `address` is `undefined` without setting `loading` to `false`. The page stays on the spinner forever.

### Fix
Change line 72 from `if (!address) return;` to `if (!address) { setLoading(false); return; }`.

### Files to Edit
- `src/pages/ReferralAdmin.tsx` — one-line fix

