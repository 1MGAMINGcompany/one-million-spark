

# Premium Predictions: Liquidity Display + Data Enrichment Plan

## Problem Summary
1. **Polymarket liquidity shows "Polymarket" text** instead of actual dollar amounts — the prices are being fetched but the pool values remain $0, so the UI falls back to the label
2. **No team/fighter images or stats** are being pulled from the sports APIs (API-Football, BallDontLie, TheSportsDB) during ingest
3. The UI needs a premium visual upgrade to match the "best-in-one" vision

## Root Cause: Liquidity Display
The `FightCard` checks `isPolymarketPool = fight.source === "polymarket" && totalPool === 0`. When Polymarket prices exist (`price_a`, `price_b`), odds display correctly, but the pool strip still shows "Polymarket" because the local `pool_a_usd`/`pool_b_usd` columns are 0. The fix: **derive implied liquidity from Polymarket prices** and display it, or show the live odds prominently instead of a raw pool number.

---

## Plan

### Step 1: Show Polymarket Odds as Liquidity Indicator
Instead of showing "Polymarket" as a static label, display the live probability percentages (derived from `price_a`/`price_b`) and a "Powered by Polymarket" badge. For example: "52% / 48%" with a Polymarket logo.

**Files:** `src/components/predictions/FightCard.tsx`, `src/components/predictions/EventSection.tsx`

Changes:
- Replace `isPolymarketPool ? "Polymarket"` with a formatted probability display: `"{Math.round(price_a * 100)}% / {Math.round(price_b * 100)}%"`
- Add a small "Polymarket" attribution badge with their logo
- In `EventSection`, update `getTotalPoolUsd` to show "Live Odds" instead of "$0.00 Pool" for Polymarket events

### Step 2: Enrich Ingest with Team/Fighter Images & Stats
Update `prediction-ingest` to pull and store images and metadata from each provider during event import.

**File:** `supabase/functions/prediction-ingest/index.ts`

**API-Football enrichment:**
- Already has `API_FOOTBALL_KEY` configured
- Fetch team logos from fixture response (`teams.home.logo`, `teams.away.logo`) — store in `home_logo`/`away_logo` on fight rows
- Fetch league logo — store in `league_logo` on event rows
- Fetch venue, referee info into `stats_json`

**BallDontLie MMA enrichment:**
- Already has `BALLDONTLIE_API_KEY` configured  
- Fetch fighter photos from fighter endpoint (`/fighters/{id}`) — store in `fighter_a_photo`/`fighter_b_photo`
- Fetch fighter records (wins/losses/draws) into `stats_json`

**TheSportsDB enrichment:**
- Uses free tier key (no secret needed)
- Fetch fighter/event thumbnails (`strThumb`, `strPoster`) — store in photos/enrichment fields
- Fetch event banners for hero images

### Step 3: Database Migration — Add Enrichment Columns
Add missing columns if not already present:

```sql
ALTER TABLE prediction_fights 
  ADD COLUMN IF NOT EXISTS fighter_a_record text,
  ADD COLUMN IF NOT EXISTS fighter_b_record text,
  ADD COLUMN IF NOT EXISTS venue text,
  ADD COLUMN IF NOT EXISTS referee text,
  ADD COLUMN IF NOT EXISTS event_banner_url text;

ALTER TABLE prediction_events
  ADD COLUMN IF NOT EXISTS event_banner_url text,
  ADD COLUMN IF NOT EXISTS venue text;
```

### Step 4: Premium UI Overhaul for FightCard
Upgrade both soccer and combat sports cards for a best-in-class look.

**File:** `src/components/predictions/FightCard.tsx`

- **Fighter photos**: Larger, with gradient overlays and glow effects for featured fights
- **Stats bar**: Show fighter records (e.g., "15-2-0") below names when `stats_json` is available
- **Probability bar**: Horizontal gradient bar showing implied probability split (red vs blue)
- **Polymarket badge**: Small "Live odds via Polymarket" attribution with icon
- **Featured fights**: Gold border + "FEATURED" ribbon for `fight.featured === true`
- **Venue/referee info**: Subtle metadata row when available

### Step 5: Event Section Visual Polish
**File:** `src/components/predictions/EventSection.tsx`

- Event banner image as collapsed header background (when `event_banner_url` exists)
- Animated gradient borders for live events
- Fighter count + total liquidity summary in header

---

## Technical Details

- **No new API keys needed** — all 3 sports API keys are already configured as secrets
- **TheSportsDB** uses the free tier key "3" (already hardcoded as fallback)
- **Polymarket prices** are already being polled every 45s by `usePolymarketPrices` hook and stored in `price_a`/`price_b` — just need to use them in the UI
- Enrichment data is fetched at ingest time (not on every page load), keeping the frontend fast
- All image URLs are external (hosted by the sports APIs) — no storage needed

