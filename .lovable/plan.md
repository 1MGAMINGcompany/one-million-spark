

# Fix Claim Failed + Balance Issues

## Problem Summary

Two issues:

1. **"Claim Failed"**: The `prediction-claim` function uses **parimutuel pool math** (`userShares / totalWinningShares * totalPool`) for ALL events, including Polymarket-backed ones. Since `pool_a_usd` and `pool_b_usd` reflect the entire Polymarket pool (millions of dollars) but `shares_a`/`shares_b` only track local user shares (~98), the calculated reward is absurdly large (e.g. $1.6M), which exceeds the $500 safety cap → 400 error.

2. **Balance not changing**: The claim never succeeds, so no payout is sent. Additionally, the current architecture tries to pay from a "treasury wallet" via `transferUsdcToWinner()`, but there is no treasury — all funds flow through Polymarket directly.

## Root Cause

For Polymarket-backed events, winnings are held **in the user's Polymarket position** (via their derived EOA / Gnosis Safe). When a market resolves, the user's winning conditional tokens can be redeemed for USDC directly on the CTF Exchange contract. The current code ignores this entirely and tries to do a treasury-to-user USDC transfer that doesn't exist.

## Fix Plan

### 1. Rewrite Polymarket claim path in `prediction-claim`

**File**: `supabase/functions/prediction-claim/index.ts`

Remove the treasury payout for Polymarket events entirely. Replace with:

- Look up the user's `prediction_trade_orders` for this fight to get `filled_shares` and `avg_fill_price`
- Calculate reward as: `filled_shares × $1.00` (each winning share resolves to $1 on Polymarket)
- Subtract the original cost: `profit = reward - (filled_shares × avg_fill_price)`
- Use the user's Polymarket session credentials (`pm_api_key`, `pm_api_secret`, `pm_passphrase`) to call the Polymarket CLOB API to redeem/merge winning conditional tokens
- If redemption isn't available yet (market not fully resolved on-chain), mark entries as `redemption_pending` and let the auto-claim worker handle it later
- Update `prediction_entries` with the actual reward amount

Key changes:
- Remove `calculateReward()` usage for Polymarket events
- Remove `transferUsdcToWinner()` call for Polymarket events  
- Add CTF redemption via Polymarket API using stored user credentials
- The reward goes directly to the user's derived EOA, then can be withdrawn to their Privy wallet

### 2. Rewrite Polymarket claim path in `prediction-auto-claim`

**File**: `supabase/functions/prediction-auto-claim/index.ts`

Same logic change — stop using parimutuel math and treasury transfers for Polymarket events. Instead:
- For each unclaimed winning entry on a Polymarket fight, look up the trade order
- Calculate reward from `filled_shares × $1.00`  
- Trigger CTF redemption using stored PM credentials
- Mark entries as claimed with accurate `reward_usd`

### 3. Fix reward display in the card

**File**: `src/components/operator/SimplePredictionCard.tsx`

Currently the card shows "You Won!" but no dollar amount. After the claim function returns the correct `reward_usd`, add display of the winnings amount on the settled card (e.g., "+$0.98").

### 4. Add withdraw-to-wallet flow (if needed)

After CTF redemption, USDC lands in the user's **derived EOA** (the Polymarket trading wallet), not their main Privy embedded wallet. The existing balance hook (`usePolygonUSDC`) checks the Privy wallet address. We may need a "withdraw" step or update the balance display to also show the derived EOA balance.

## What Does NOT Change
- Frontend claim button and toast logic (already correct)
- Fight status detection and scheduling (already fixed)
- Balance polling hooks (already poll every 15s)
- Native/manual event claim path (keeps parimutuel math)

## Expected Outcome
- Clicking "Collect Winnings" triggers CTF redemption on Polymarket
- User sees accurate reward amount (~$0.98 for a $1.00 winning bet at ~0.50 odds)
- Balance updates once USDC is redeemed to their trading wallet

