

## Investigation Results

**Confirmed bug**: The Gamma API returns real prices (`outcomePrices: ["0.325", "0.675"]`) for MMA moneyline markets, but the edge function is writing `0/1` to the database. I verified this by:
1. Directly fetching `gamma-api.polymarket.com/markets/1510805` — returns `0.325/0.675`, `bestBid: 0.32`, `bestAsk: 0.33`, `lastTradePrice: 0.34`
2. Running the edge function — it reports `price_source=gamma a=0 b=1` for the same market

The Gamma API is returning inconsistent `outcomePrices` values to the edge function (possibly due to CDN caching, geo-routing, or market resolution state) while `bestBid`, `bestAsk`, and `lastTradePrice` remain accurate.

**Key data from Gamma for Sutherland vs Pericic (1510805):**
- `outcomePrices`: `["0.325", "0.675"]` (from browser) vs `["0", "1"]` (from edge function)  
- `bestBid`: `0.32`, `bestAsk`: `0.33`, `lastTradePrice`: `0.34` — consistently correct
- `active: true`, `closed: false`

The `outcomePrices` field is unreliable for MMA markets. The worker needs a sanity check.

---

## Plan

### 1. Add bestBid/bestAsk sanity check in the worker

**File:** `supabase/functions/polymarket-prices/index.ts`

After parsing `outcomePrices` from Gamma, check if the prices are extreme (exactly 0 or 1) while `bestBid`/`bestAsk` or `lastTradePrice` show real trading activity. If so, use those instead:

```
if outcomePrices gives [0, 1] or [1, 0]:
  check bestBid / bestAsk / lastTradePrice from Gamma response
  if bestBid > 0.01 and bestBid < 0.99:
    priceA = bestBid (for side A token)
    priceB = 1 - bestBid
  this prevents resolved-looking but actually-active markets from showing 0/1
```

Also extract and store `bestBid`, `bestAsk`, `lastTradePrice` from the Gamma response as supplementary data for diagnostics.

### 2. Auto-detect truly resolved markets

When `outcomePrices` is extreme AND `bestBid`/`bestAsk` are also extreme (or absent/zero), AND `closed: true` or `active: false`, flag the fight for status update (e.g., from "open" to "locked" or "confirmed").

### 3. UI: handle extreme-price Polymarket fights gracefully

**Files:** `FightCard.tsx`, `HomePredictionHighlights.tsx`, `PredictionHighlights.tsx`

When `price_a` is exactly 0 or 1 (and `price_b` is the complement), and the source is Polymarket:
- Show "Resolving" instead of "<1% / >99%"  
- Hide the "Predict" button
- Display "Market settling" in the odds area instead of "1.00X" / "—"

### Files to update
- `supabase/functions/polymarket-prices/index.ts` — sanity check with bestBid/bestAsk
- `src/components/predictions/FightCard.tsx` — extreme-price display handling
- `src/components/predictions/HomePredictionHighlights.tsx` — same
- `src/components/predictions/PredictionHighlights.tsx` — same

