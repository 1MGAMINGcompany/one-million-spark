

# Fix Predictions: Live Liquidity, Sport Icons, Match Center Stats

## Problems from Screenshots
1. "$0.00 USDC" on Polymarket events — no real liquidity data being fetched
2. No fighter/team images (enrichment not running)
3. Boxing gloves (🥊) shown for soccer and Over/Under markets
4. Match Center shows 🥊 for soccer events
5. Over/Under markets need arrow icons instead of fighter names
6. Match Center lacks team/fighter stats and context

---

## Step 1: Fetch Polymarket Volume During Price Polling

**File:** `supabase/functions/polymarket-prices/index.ts`

The CLOB API at `https://clob.polymarket.com/market/{condition_id}` returns market volume data. During the existing 45s price poll, also fetch volume per outcome and store it in `pool_a_usd` / `pool_b_usd`.

- Add `polymarket_condition_id` to the select query
- For each fight, fetch `GET https://clob.polymarket.com/market/{condition_id}` (public, no auth)
- The response includes `tokens[].winner` and volume data
- Alternative: use Gamma API `https://gamma-api.polymarket.com/markets?condition_id={id}` which returns `volume`, `volumeNum`, and per-outcome token data
- Store derived per-side volume in `pool_a_usd` / `pool_b_usd`

**Database migration:** Add `polymarket_volume_usd` column to `prediction_fights` for total market volume.

```sql
ALTER TABLE prediction_fights ADD COLUMN IF NOT EXISTS polymarket_volume_usd numeric DEFAULT 0;
```

## Step 2: Fix Sport Detection & Fallback Icons

**File:** `src/components/predictions/FightCard.tsx`

Add a `detectSport(fight)` helper that returns `'soccer' | 'over_under' | 'combat'`:
- `source === "api-football"` → soccer
- `event_name` contains soccer keywords (MLS, Premier League, La Liga, FUTBOL, SOCCER, EPL) → soccer
- `fighter_a_name.toLowerCase() === "over"` or title contains "O/U" → over_under
- Default → combat

Update `FighterColumn` fallback (line 520-523):
- Soccer: show ⚽ instead of 🥊
- Over/Under: show `ArrowUp` (green) for "Over", `ArrowDown` (red) for "Under"
- Combat: keep 🥊

Pass sport type through to `FighterColumn` and `SoccerTeamColumn`.

## Step 3: Fix "$0.00 USDC" Display

**File:** `src/components/predictions/FightCard.tsx`

In `FighterColumn` and `SoccerTeamColumn` (lines 529-531, 573):
- When `poolAmount === 0` and fight is Polymarket-backed: show probability percentage (e.g., "52%") instead of "$0.00 USDC"
- When `poolAmount > 0`: show actual USDC amount as today

In `PolymarketPoolStrip`: when pools are zero, show "Volume: $X" from the new `polymarket_volume_usd` field, or just the live probability bar without dollar amounts.

## Step 4: Fix Match Center Sport Detection

**File:** `src/pages/MatchCenter.tsx`

- Add `isSoccer` detection using event_name keywords (same as FightCard), not just `source === "api-football"`
- Add Over/Under detection from title/fighter names
- Use correct fallback icon per sport in `FighterProfile` component
- When pools are $0 for Polymarket events, show "Live Market Odds" with probabilities instead of empty dollar breakdown
- Add sport-specific section titles ("Team Stats" vs "Fighter Stats")

## Step 5: Enrich Existing Events (Re-enrich Action)

**File:** `supabase/functions/prediction-ingest/index.ts`

The re-enrich logic already exists but needs to be triggered. Verify the `action: "re-enrich"` path works correctly:
- For MMA fights: fetch from BallDontLie `/fighters?search={name}`
- For Boxing: fetch from TheSportsDB `searchplayers.php?p={name}`
- For Soccer (Polymarket-imported): detect sport from event_name, fetch team logos from TheSportsDB `searchteams.php?t={team_name}`

Add soccer team enrichment path for Polymarket-imported soccer events (currently only API-Football soccer gets logos).

## Step 6: Match Center Stats Enhancement

**File:** `src/pages/MatchCenter.tsx`

- Add a "Predict" button that links back to the prediction modal
- Show Polymarket volume when available
- For soccer: show league table position, recent form from `stats_json`
- For combat: show reach, height, stance from `stats_json`
- Add live odds display with multipliers (e.g., "2.02x")

---

## Technical Details

- Polymarket CLOB `/market/{condition_id}` is public (no auth needed) — same as `/price`
- Gamma API `gamma-api.polymarket.com/markets?condition_id=X` returns `volumeNum` (total volume in USD)
- Per-side volume can be estimated as `volumeNum * price_a` and `volumeNum * price_b`
- The price polling edge function already runs every 45s — adding volume fetch is minimal overhead
- Sport detection reuses the same keyword logic from `parseSport` in `EventSection.tsx`
- No new API keys needed

