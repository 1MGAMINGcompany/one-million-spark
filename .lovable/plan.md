

# Audit: Polymarket Volume, Sport Icons, and Match Center Fixes

## Findings

### 1. CRITICAL BUG: Gamma API query uses wrong parameter
The `polymarket-prices` edge function fetches volume via:
```
GET gamma-api.polymarket.com/markets?condition_id={id}
```
This does NOT filter correctly — Gamma ignores `condition_id` as a query param and returns unrelated markets. **This is why volume is always 0.**

**Fix**: Use the numeric `polymarket_market_id` (e.g., `1521484`) stored on each fight:
```
GET gamma-api.polymarket.com/markets/{polymarket_market_id}
```
This returns the correct market with `volumeNum: 601549.62` ($601K), `volume24hr`, `image`, `icon`, `groupItemTitle`, and more.

The `polymarket_market_id` column already exists and is populated (confirmed via DB query).

### 2. MatchCenter shows boxing gloves for soccer
The `detectSport()` logic works correctly — "Fútbol" in the event name matches the keyword list. The MatchCenter `FighterProfile` component (line 309-312) correctly shows ⚽ for soccer. **The user's screenshot may be from before the last deployment.** However, the code path for passing `home_logo`/`away_logo` to the profile is correct but both are NULL since no enrichment has run.

**Additional fix**: During the Gamma API volume fetch, we can also pull the `image` field from the Gamma response and store it as `home_logo`/`away_logo` or `fighter_a_photo`. The Gamma API returns a league image (La Liga logo) which is better than nothing.

### 3. Fight names show "Yes"/"No" instead of team names
Polymarket binary markets use "Yes"/"No" as outcome names. The Gamma API provides `groupItemTitle` (e.g., "Villarreal CF") which is the meaningful display name. For soccer events, we should display the `title` field (which already contains "Villarreal CF") instead of "Yes"/"No".

### 4. Events endpoint has aggregate volume
`GET gamma-api.polymarket.com/events/{polymarket_event_id}` returns:
- `volume`: $790K total across all markets in the event
- `volume24hr`: $705K
- Individual market data nested under `markets[]`

This could be fetched at the event level for efficiency.

---

## Plan

### Step 1: Fix Gamma API query in polymarket-prices
**File:** `supabase/functions/polymarket-prices/index.ts`

- Add `polymarket_market_id` to the select query
- Change Gamma fetch from `?condition_id=` to `/markets/{polymarket_market_id}`
- Parse the single object response (not array)
- Extract `volumeNum`, `volume24hr`, `image`/`icon` from response
- Store volume in `polymarket_volume_usd`, and optionally set `fighter_a_photo` from `image` if currently null

### Step 2: Display volume on cards like Polymarket does
**File:** `src/components/predictions/FightCard.tsx`

- In `PolymarketPoolStrip`: show volume prominently (e.g., "$601K Vol.") like Polymarket does, with formatting for K/M
- For soccer events with "Yes"/"No" fighter names: use the fight `title` as display name instead (it contains the team name like "Villarreal CF")
- Show probability as price in cents (e.g., "49.5¢") matching Polymarket's display style

### Step 3: Fix MatchCenter volume and Yes/No display
**File:** `src/pages/MatchCenter.tsx`

- When `fighter_a_name === "Yes"`: use `title` as the display name instead
- Show volume in the Pool/Volume card when available
- Ensure sport fallback icons are working (verify ⚽ for soccer)

### Step 4: Improve PolymarketPoolStrip with volume formatting
Show volume tiers: `$601K Vol.` or `$1.2M Vol.` matching Polymarket's reference UI style.

---

## Technical Details

- Gamma API `/markets/{id}` returns a single object, not an array — parsing needs to handle this
- `polymarket_market_id` is a numeric string (e.g., "1521484") already stored on all Polymarket fights
- Volume data: `volumeNum` (total), `volume24hr` (24h), `volume1wk` (7d) are all available
- The `image`/`icon` fields from Gamma are league-level logos (e.g., La Liga), not team-specific logos
- No database migration needed — all columns already exist

