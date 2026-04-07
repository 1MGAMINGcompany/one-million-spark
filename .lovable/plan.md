

# Fix Plan: Wrong Reward Amount ($98) + Share Card Logo

## Issue 1: $98 Reward is Fictional

**Root cause**: The claim function calculates reward as `filled_shares × $1.00`. For this user:
- `filled_shares = 98` (from `prediction_trade_orders`)
- So reward = 98 × $1.00 = **$98.00**

But `98` is the **native share count** (100 shares per $1, at $0.01/share). The actual stake was only **$0.98** (`filled_amount_usdc = 0.98`). Additionally, `polymarket_order_id` is null for all this user's trades — meaning the orders were **never actually executed on Polymarket's CLOB**. There are no conditional tokens on-chain to redeem. The CTF redemption silently fails, the $98 reward gets written to the database, and the balance never changes because no real money moved.

**Why balance is stuck at $2.44**: The "Collect Winnings" button triggered the claim, which marked the entry as `claimed: true` with `polymarket_status: redemption_pending` — but the CTF redemption returned nothing (no tokens exist), and the USDC transfer from the derived EOA found $0 balance. So the entry says "claimed" but nothing was paid.

**The fix**: When `polymarket_order_id` is null, the trade was simulated locally, not placed on Polymarket. The reward calculation must use the actual cost basis (`filled_amount_usdc`) and pool odds, not the $1-per-share Polymarket resolution model.

### Changes

**File: `supabase/functions/prediction-claim/index.ts`** (lines 421-555)

In the Polymarket claim path:
- Check if `polymarket_order_id` exists in trade orders
- If **no real PM order**: skip CTF redemption entirely. Calculate reward using local pool math: `(userShares / totalWinningShares) × totalPool` with the *local* shares/pool values (shares_b=98, pool from local entries only, not Polymarket's $1.6M pool)
- If **real PM order exists**: keep current CTF redemption path but use `filled_amount_usdc / avg_fill_price` for accurate share count

Also fix the pool values used in reward calculation — currently `pool_a_usd` and `pool_b_usd` contain the **entire Polymarket market pool** ($1.6M), not local user deposits. The local pool is just the sum of `filled_amount_usdc` from all `prediction_trade_orders` for this fight.

Specific logic:
```
// If no polymarket_order_id → local simulation, use local pool
const hasRealPMOrder = tradeOrders.some(o => o.polymarket_order_id);

if (!hasRealPMOrder) {
  // Sum all local entries' filled_amount_usdc for this fight as the pool
  const localPool = allFightOrders.reduce(sum filled_amount_usdc)
  const userStake = userOrders.reduce(sum filled_amount_usdc)  
  // Winner takes proportional share of local pool
  reward = (userStake / winnerTotalStake) * localPool
  // Skip CTF redemption — no on-chain position exists
}
```

**File: `supabase/functions/prediction-auto-claim/index.ts`**

Same fix — detect null `polymarket_order_id` and use local pool math instead of `filled_shares × $1.00`.

### Data Repair

Reset the incorrectly claimed entry so it can be re-claimed with correct math:
- Entry `3b12bf1f`: set `claimed = false`, `reward_usd = null`, `polymarket_status = 'pending'`

## Issue 2: Share Card Logo Too Small

**Root cause**: In `SocialShareModal.tsx` line 169, the logo is rendered at `w-16 h-16` (64×64 CSS pixels). On a phone screen this is tiny, especially for operator logos that may have text in them.

**File: `src/components/SocialShareModal.tsx`** (line 169)

- Increase logo from `w-16 h-16` to `w-28 h-28` (112px)
- Keep `object-contain` so it scales proportionally
- Add `bg-white/5 p-2` for visual padding around the logo

## Summary

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| $98 reward | `filled_shares(98) × $1` treats native shares as PM shares | Use `filled_amount_usdc` and local pool math when `polymarket_order_id` is null |
| Balance unchanged | CTF redemption fails silently (no on-chain position) | Skip CTF for non-PM-executed trades; use local pool payout |
| Logo too small | `w-16 h-16` on share card | Increase to `w-28 h-28` |

