

## Plan: Fix Referral Admin Navigation from Predictions Admin

### Root Cause
In `FightPredictionAdmin.tsx` line 375, the "Referrals" button uses `window.location.href = '/referrals/admin'` which causes a **full page reload**. This drops the wallet connection state — when the Referral Admin page loads fresh, `address` is `null` initially, so it shows "Admin Access Required" instead of loading the data.

### Fix
**`src/pages/FightPredictionAdmin.tsx`** — Change `window.location.href = '/referrals/admin'` to use React Router's `navigate('/referrals/admin')` for client-side navigation that preserves wallet state. The component likely already imports `useNavigate`.

This single change will:
- Preserve the wallet connection when navigating from Predictions Admin → Referrals Admin
- Allow the admin check (`prediction_admins` table query) to succeed immediately since `address` is already available
- Enable creating referral codes without re-connecting

### Files to Edit
- `src/pages/FightPredictionAdmin.tsx` — replace `window.location.href` with `navigate()` call

