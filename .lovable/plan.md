
# Premium Predictions: Live Liquidity, Sport Icons, Match Center — COMPLETED

## What was done

### Step 1: Live Polymarket Volume ✅
- `polymarket-prices` edge function now fetches volume from Gamma API (`gamma-api.polymarket.com/markets/{polymarket_market_id}`)
- **Fixed critical bug**: was using `?condition_id=` query param (ignored by Gamma) — now uses `/markets/{id}` path
- Stores total volume in `polymarket_volume_usd` column
- Derives per-side liquidity (`pool_a_usd`, `pool_b_usd`) from `volume * price`
- Also pulls `image` from Gamma to populate `fighter_a_photo` when missing

### Step 2: Sport Detection & Fallback Icons ✅
- Created `src/lib/detectSport.ts` with `detectSport()` helper returning `soccer | over_under | combat`
- Soccer events show ⚽ instead of 🥊
- Over/Under markets show green ↑ / red ↓ arrow icons

### Step 3: Fixed "$0.00 USDC" Display ✅
- Shows "Market-backed" when pool is $0
- Shows probabilities in cents (e.g., "49¢") matching Polymarket style
- Volume displayed as "$601K Vol." or "$1.2M Vol."

### Step 4: Fixed "Yes"/"No" Display ✅
- Polymarket binary markets use "Yes"/"No" — now resolves to team/fighter name from title
- Applied to both FightCard (PolymarketPoolStrip) and MatchCenter

### Step 5: Database Migration ✅
- Added `polymarket_volume_usd numeric DEFAULT 0` to `prediction_fights`
