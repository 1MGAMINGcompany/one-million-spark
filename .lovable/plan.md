
## Polymarket MMA Odds Fix — Completed

### Changes Made

1. **Worker: bestBid/bestAsk sanity check** (`supabase/functions/polymarket-prices/index.ts`)
   - After parsing Gamma `outcomePrices`, checks if prices are extreme (0/1) while the market is still active
   - Falls back to `bestBid` → `bestAsk` → `lastTradePrice` if any of them show real trading activity (between 0.01 and 0.99)
   - Auto-detects truly resolved markets (extreme prices + `active: false` or `closed: true`)
   - Logs sanity overrides for diagnostics

2. **UI: resolving state detection** (`FightCard.tsx`, `PredictionHighlights.tsx`, `HomePredictionHighlights.tsx`)
   - Added `isResolvingPrice()` helper that detects Polymarket fights with exactly 0/1 prices
   - `calcOdds()` now returns a `resolving` flag
   - When resolving: shows "Market Settling" badge, hides Predict buttons, suppresses probability bar
   - `canPredict` is false when resolving

3. **Precision formatting** (already in place from prior fix)
   - `formatProb()` shows `<1%`, `>99%`, or single-decimal precision for extreme values
