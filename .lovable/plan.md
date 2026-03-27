

# Fix: Show Polymarket Liquidity & Remove Polymarket Branding

## Summary
Three changes across 3 files:
1. Show Polymarket liquidity/volume instead of empty "$0.00" pools
2. Remove all "Powered by Polymarket" text and links
3. Also fix the previous plan items (backfill category, fix "Not Team" labels, add flags)

## Changes

### 1. `src/components/predictions/FightCard.tsx`

**Remove PolymarketBadge component** (lines 217-227) — delete entirely.

**Update `PolymarketPoolStrip`** (lines 243-280):
- Remove the `<PolymarketBadge />` call
- When `hasPool` is false (local pools are $0), show Polymarket liquidity/volume instead of "$0.00"
- Add `polymarket_liquidity` to the `Fight` interface
- Per-side amounts: show probability-weighted liquidity (e.g., if liquidity=$10K and probA=26%, show ~$2.6K for side A)
- Center section: show total volume instead of "Powered by Polymarket"

**Update `SoccerTeamColumn`** (line 763):
- Change `$0.00 USDC` / `Market-backed` to show Polymarket liquidity when available
- Pass liquidity and probability data to the column

### 2. `src/pages/MatchCenter.tsx`

**Remove "Powered by Polymarket" badge and link** (lines 382-396):
- Delete the entire block that shows "Powered by Polymarket" and the "View on Polymarket" link

### 3. `src/components/predictions/PredictionHighlights.tsx`

**Update pool display** (lines 199-205):
- When pool is $0 for Polymarket fights, show liquidity from `polymarket_volume_usd` or formatted volume instead of just "Polymarket"
- Add `polymarket_volume_usd` and `polymarket_liquidity` to the HighlightCard's Fight usage

### 4. `src/lib/resolveOutcomeName.ts`

**Fix the vsMatch branch** (lines 38-45):
- Lines 41 and 44 still return `Not ${team}` — change to return `"No"` when `fighter_a_name === "Yes"` and `fighter_b_name === "No"` (binary market detection)

### 5. DB backfill (via insert tool)
- `UPDATE prediction_events SET category = 'FUTBOL' WHERE source_provider = 'polymarket' AND category IS NULL AND event_name ILIKE '%vs.%'` — for known soccer events
- `UPDATE prediction_fights SET home_logo = '...flagcdn...', away_logo = '...'` for South Africa vs Panama fights

### 6. `supabase/functions/polymarket-sync/index.ts`
- In the existing-fight update path, also set `home_logo`/`away_logo` if currently null and flags can be resolved

## Pool Display Logic (key change)
```
For Polymarket fights where local pool = $0:
  - Per-side: show probability % (e.g. "26%" / "74%") 
  - Total: show Polymarket volume (e.g. "$12.5K Vol.")
  - If liquidity available: show "$X Liquidity"
  
For fights with local pool > $0:
  - Show actual pool amounts as before
```

## Files Changed
- `src/components/predictions/FightCard.tsx` — remove Polymarket branding, show liquidity
- `src/pages/MatchCenter.tsx` — remove "Powered by Polymarket" block  
- `src/components/predictions/PredictionHighlights.tsx` — show volume/liquidity for Polymarket
- `src/lib/resolveOutcomeName.ts` — fix "Not Team" → "No" in vsMatch branch
- `supabase/functions/polymarket-sync/index.ts` — backfill logos on re-sync
- DB updates — backfill category and flags

