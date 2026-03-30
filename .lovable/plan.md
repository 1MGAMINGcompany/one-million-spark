

## Plan: Dynamic Polymarket Fee Rate + UI Cost Breakdown + Referral Tag

### What Changed
Polymarket now charges up to 0.75% probability-based fees on all sports markets (as of March 30, 2026). Our code currently hardcodes `feeRateBps: 0n` / `"0"` in the EIP-712 order. This must be fetched dynamically per order.

### Changes

#### 1. Backend: Fetch Polymarket fee rate before every order
**File:** `supabase/functions/prediction-submit/index.ts`

- Before calling `buildAndSubmitClobOrder`, fetch the fee rate from `https://clob.polymarket.com/fee-rate?token_id={tokenId}`
- Pass the fetched `feeRateBps` into `buildAndSubmitClobOrder` as a new parameter
- Inside `buildAndSubmitClobOrder`, use the dynamic value instead of `0n`/`"0"` in both the EIP-712 message and the POST body
- Store the Polymarket exchange fee in the trade order record (`pm_fee_rate_bps` field — new column)
- Return `pm_fee_rate_bps` in the response so the frontend can display it

#### 2. Backend: Add Polymarket referral/affiliate tag to orders
**File:** `supabase/functions/prediction-submit/index.ts`

- Add our affiliate address to the order body: `"affiliateAddress": "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d"` (treasury wallet) — this registers us for Polymarket's 30% fee referral share on $10K+ volume
- The affiliate address goes in the POST body alongside the `order` object, not inside the EIP-712 signed message

#### 3. Database: Track Polymarket exchange fee per order
**Migration:** Add `pm_fee_rate_bps` column to `prediction_trade_orders`

```sql
ALTER TABLE prediction_trade_orders 
ADD COLUMN IF NOT EXISTS pm_fee_rate_bps integer DEFAULT 0;
```

#### 4. Frontend: Show split cost breakdown
**Files:** `PredictionModal.tsx`, `TradeTicket.tsx`, `SoccerMatchCard.tsx`, `FightCard.tsx`

Currently the UI shows a single "Platform Fee (2%)" line. Update to show:
- **Polymarket Fee (0.XX%)** — from the market's dynamic fee rate (displayed from cached price data or response)
- **Platform Fee (1%)** — our platform fee (for Polymarket sources, the 2% is split: ~0.75% exchange + 1% platform + 0.25% buffer)
- **Total Fees** — sum of both

For the inline prediction cards (`SoccerMatchCard`, `FightCard`), update `estimateWin` to factor in both fees.

Note: The Polymarket fee is baked into the CLOB order execution (it's taken from the order amount by the exchange), so from the user's perspective our displayed "Platform Fee" remains the same. The new line item is informational — showing users the exchange fee that Polymarket charges.

### Technical Details

**Fee rate API response format:**
```json
{ "fee_rate_bps": 75 }
```
This means 0.75% = 75 basis points. The value varies by market probability.

**Order body with affiliate:**
```json
{
  "order": { ... "feeRateBps": "75" ... },
  "owner": "0x...",
  "orderType": "GTC",
  "affiliateAddress": "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d"
}
```

### Files Changed
1. `supabase/functions/prediction-submit/index.ts` — dynamic fee fetch, affiliate tag, pass to order builder
2. `src/components/predictions/PredictionModal.tsx` — split fee display
3. `src/components/predictions/TradeTicket.tsx` — add Polymarket fee line item
4. `src/components/predictions/SoccerMatchCard.tsx` — update fee display
5. `src/components/predictions/FightCard.tsx` — update fee display
6. New migration — `pm_fee_rate_bps` column on `prediction_trade_orders`

