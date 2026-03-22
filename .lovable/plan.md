

## Plan: Past Events Tab + Polygon Wallet Support for Referrals

### Part 1: Past Events — "View Past Events" Section

**Problem**: Finished fights disappear or show misleading data. Users need to see results and know their winnings are coming.

**Solution**: Replace the current "AWAITING RESULTS" past section with a collapsible "Past Events" section at the bottom of the predictions page, hidden by default behind a button. Only shows events from the last 48 hours.

**File: `src/pages/FightPredictions.tsx`**
- Filter `pastEvents` to only include events whose fights resolved within the last 48 hours
- Replace the inline past section with a "View Past Events" button at the bottom
- When expanded, show a header explaining: "Results stay visible for 48 hours. Winnings are automatically sent to your wallet."
- Inside, render the same `EventSection` components but with a "COMPLETED" visual treatment
- Each fight card already handles winner display via `FightCard` status logic

**File: `src/components/predictions/EventSection.tsx`**
- No major changes needed — it already renders fights with their status badges

**File: `src/components/predictions/FightCard.tsx`**
- Ensure `locked`, `confirmed`, `settled` statuses show the winner name clearly
- For settled fights with a winner, show "Winner: [name]" badge prominently

### Part 2: Referral Admin — Polygon Wallet Support

**Problem**: The referral admin issue-code form says "Solana or Polygon wallet address" but the edge function validates `wallet.length < 32`. Polygon addresses are 42 characters (0x + 40 hex), so they pass validation. However, the payout history links to Solscan (Solana explorer), and the payout modal says "Solana transaction signature". These need updating for Polygon support.

**Changes needed:**

**File: `src/pages/ReferralAdmin.tsx`**
- Detect wallet type (starts with `0x` = Polygon, else Solana)
- Payout history: use Polygonscan link for `0x` wallets, Solscan for others
- Payout modal: change "Solana transaction signature" to "Transaction hash" (generic)
- Change "SOL" labels to show appropriate currency based on wallet type
- Add a "Payout Wallet (Polygon)" optional field in the issue-code form so admins can associate an EVM address for payouts

**File: `supabase/functions/referral-admin-set-code/index.ts`**
- Already accepts wallets >= 32 chars — Polygon `0x...` (42 chars) passes. No change needed.

**File: `supabase/functions/referral-bind/index.ts`**
- Already accepts wallets >= 32 chars — works for both chains. No change needed.

**File: `supabase/functions/referral-admin-record-payout/index.ts`**
- Already accepts wallets >= 32 chars. No change needed.

### Summary of File Changes

1. **`src/pages/FightPredictions.tsx`** — Add collapsible "Past Events" section at bottom with 48h filter and user-friendly messaging
2. **`src/components/predictions/FightCard.tsx`** — Add winner display for settled/confirmed fights
3. **`src/pages/ReferralAdmin.tsx`** — Update payout history links to support Polygonscan, make labels chain-aware, update copy to be generic

