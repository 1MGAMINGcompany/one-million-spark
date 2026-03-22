
Findings

- This is not a frontend refresh problem. The live price poll is mounted on the predictions page in `src/pages/FightPredictions.tsx` via `usePolymarketPrices()`, and the MMA fights in the database have fresh `polymarket_last_synced_at` timestamps.
- The problem is in the data the UI receives for many MMA Polymarket markets:
  - several MMA fights have `polymarket_volume_usd > 0`
  - but `price_a` / `price_b` are often `0.0000`, or one side is `0.9990` while the other is `0.0000`
- The UI odds logic in:
  - `src/components/predictions/FightCard.tsx`
  - `src/components/predictions/PredictionHighlights.tsx`
  - `src/components/predictions/HomePredictionHighlights.tsx`
  only uses Polymarket odds when both sides are `> 0`. Otherwise it falls back to pool math, and if pool totals are zero it renders `2.00x`.

Root cause

- In `supabase/functions/polymarket-prices/index.ts`, the worker fetches CLOB BUY prices per outcome token.
- For many MMA prop/Yes-No/O-U markets, that endpoint is returning incomplete quotes:
  - both sides zero, or
  - only one side priced
- The worker then writes:
  - `price_a` / `price_b` as received
  - but only writes `pool_a_usd` / `pool_b_usd` when `totalVolume > 0 && priceA > 0 && priceB > 0`
- So the frontend ends up with:
  - no usable prices
  - no derived pool fallback
  - and the hardcoded empty-state fallback becomes `2.00x`

Why fútbol looks better

- The soccer markets you’re comparing against are getting valid two-sided prices more consistently, so the UI can compute `1 / price` and show real odds.
- MMA has more markets where Polymarket is effectively returning sparse or one-sided quote data, especially on props.

Plan to fix it so it does not happen again

1. Harden the price ingestion worker
- Update `supabase/functions/polymarket-prices/index.ts` so it no longer treats “both sides must be present” as required.
- For binary Polymarket markets:
  - if only one side is valid, derive the other side from the complement when appropriate
  - if the CLOB price endpoint is empty, fall back to Gamma market outcome pricing if available
- Always persist a usable market state instead of raw zeroes whenever the source provides enough information.

2. Stop coupling displayed liquidity to two valid prices
- Change the worker so `polymarket_volume_usd`, `polymarket_liquidity`, and any displayable derived values are saved even when one side price is missing.
- This prevents the UI from looking like a dead even market when the market actually has activity.

3. Replace the misleading `2.00x` fallback for Polymarket fights
- Update `calcOdds` logic in:
  - `src/components/predictions/FightCard.tsx`
  - `src/components/predictions/PredictionHighlights.tsx`
  - `src/components/predictions/HomePredictionHighlights.tsx`
- New behavior:
  - use two-sided prices when available
  - use one-sided/complement price when only one side is available
  - if the fight is Polymarket-backed but pricing is unavailable, show a non-misleading state like `—` or `Market price unavailable` instead of `2.00x`

4. Add a bad-market safeguard in admin/backend
- Add a detection path for Polymarket fights where:
  - `source='polymarket'`
  - `polymarket_active=true`
  - volume/liquidity exists
  - but usable odds are missing
- Surface these as “needs price refresh / incomplete market data” in admin so they can be identified before going live.

5. Add a regression check
- Add a small validation rule in the worker or admin diagnostics:
  - if a Polymarket fight has volume/liquidity but would display as empty/even fallback, flag it
- This prevents future MMA imports from silently showing fake 2.00x odds again.

Technical details

- Current failing UI condition:
  - `if (priceA && priceA > 0 && priceB && priceB > 0) ...`
  - else fallback to pool totals
  - if total pool is zero => `2.00x`
- Current failing worker condition:
  - derived pool display values are only written when both prices are valid
- No backend auth/RLS changes are needed for this fix; this is worker + display logic.
