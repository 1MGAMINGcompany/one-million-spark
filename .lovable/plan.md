
# Premium Predictions: Live Liquidity, Sport Icons, Match Center — COMPLETED

## What was done

### Step 1: Live Polymarket Volume ✅
- `polymarket-prices` edge function now fetches volume from Gamma API (`gamma-api.polymarket.com/markets?condition_id=X`)
- Stores total volume in new `polymarket_volume_usd` column
- Derives per-side liquidity (`pool_a_usd`, `pool_b_usd`) from `volume * price`
- Cards now show real dollar amounts instead of "$0.00"

### Step 2: Sport Detection & Fallback Icons ✅
- Created `src/lib/detectSport.ts` with `detectSport()` helper returning `soccer | over_under | combat`
- Soccer events (from event_name keywords or api-football source) now show ⚽ instead of 🥊
- Over/Under markets show green ↑ / red ↓ arrow icons
- Applied to both FightCard and MatchCenter

### Step 3: Fixed "$0.00 USDC" Display ✅
- FighterColumn and SoccerTeamColumn show "Market-backed" when pool is $0
- PolymarketPoolStrip shows probabilities (e.g., "52%") when no pool, plus volume when available
- MatchCenter shows "Live Market Odds" with probabilities and multipliers when pools are empty

### Step 4: Match Center Sport Detection ✅
- Uses `detectSport()` for proper icon selection
- Soccer events show ⚽ not 🥊 in FighterProfile
- Over/Under shows arrow icons
- Sport-specific stats title ("Team Stats" vs "Fighter Stats")
- Added "Predict" button in header
- Shows volume data when available

### Step 5: Soccer Team Enrichment in Re-enrich ✅
- Re-enrich action now detects soccer events from event_name keywords
- Fetches team logos from TheSportsDB `searchteams.php?t={name}`
- Stores in `home_logo` / `away_logo` columns
- Also enriches Polymarket-sourced combat events via TheSportsDB fighter lookup

### Step 6: Database Migration ✅
- Added `polymarket_volume_usd numeric DEFAULT 0` to `prediction_fights`
