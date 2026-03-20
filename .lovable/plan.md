

# Premium Predictions: USDC Display, Fighter Images & Stats Hub

## Current Issues

1. **No USDC amounts shown per side** — Polymarket fights have `pool_a_usd = 0` and `pool_b_usd = 0` because liquidity lives on-chain. The `isPolymarket` flag hides the `$0.00` but also hides any USDC amounts entirely. For Polymarket events, we should show the **implied USDC volume** derived from Polymarket API data, or at minimum show the per-side probability with clear labels. For native events, USDC per side should always be visible.

2. **No fighter images/records** — The enrichment columns exist in the DB (`fighter_a_photo`, `fighter_a_record`, `venue`, etc.) but are all NULL. The ingest function was not updated with the enrichment fetch logic. Existing events need re-enrichment, NOT cancellation.

3. **No stats/detail view** — There is no "Match Center" or fighter profile page where users can see stats, injury news, or reasons for odds movement.

---

## Plan

### Step 1: Always Show USDC Per Side on Cards
**File:** `src/components/predictions/FightCard.tsx`

- For Polymarket events: derive implied USDC per side from the probability bar. Show `pool_a_usd` / `pool_b_usd` labels even when zero, labeled as "USDC on Yes" / "USDC on No" (or fighter names).  
- For native events: already works, just ensure it's always visible (remove the `!isPolymarket` guard on FighterColumn pool display).
- In `PolymarketPoolStrip`: add per-side dollar labels below the probability bar showing actual pool values when > 0, or "Market-backed" when 0.

### Step 2: Add Enrichment Logic to Ingest Function
**File:** `supabase/functions/prediction-ingest/index.ts`

Add a post-upsert enrichment step that runs for each fight:
- **BallDontLie (MMA)**: For each fighter name, call `/fighters?search={name}` to get photo URL and record (wins/losses/draws). Store in `fighter_a_photo`, `fighter_a_record`.
- **TheSportsDB (Boxing/Muay Thai)**: Call `searchplayers.php?p={name}` to get `strThumb` (photo) and record. Store similarly.
- **API-Football (Soccer)**: Already fetches `home_logo`/`away_logo` from fixture data — ensure these are mapped into the upsert. Add venue from fixture response.
- Only update enrichment columns if currently NULL (don't overwrite manual editorial).

### Step 3: Re-Enrich Existing Events
Add an `?action=re-enrich` mode to the ingest function that:
- Reads all open fights with NULL `fighter_a_photo`
- Attempts to fetch photos/records from the APIs
- Updates only enrichment columns
- This avoids cancelling and re-creating events

### Step 4: Create Match Center / Fight Detail Page
**New file:** `src/pages/MatchCenter.tsx`
**Route:** `/predictions/:fightId`

A dedicated page for each fight/match showing:
- Large fighter photos side by side with records
- Live odds chart (probability over time from `price_a`/`price_b` history)
- Explainer card content (admin-editable `explainer_card` field)
- Stats from `stats_json` (reach, height, stance, recent form)
- News/updates section (initially from `explainer_card`, later from AI-generated content)
- "Why odds moved" section — shows timestamped notes (e.g., "Fighter A injury reported") from a new `fight_updates` table or from `explainer_card` JSON

### Step 5: Add News/Updates Table for Odds Movement Context
**Database migration:** Create `prediction_fight_updates` table:

```sql
CREATE TABLE prediction_fight_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fight_id uuid NOT NULL,
  content text NOT NULL,
  source text DEFAULT 'admin',
  impact text, -- 'positive_a', 'positive_b', 'neutral'
  created_at timestamptz DEFAULT now()
);
ALTER TABLE prediction_fight_updates ENABLE ROW LEVEL SECURITY;
-- public read, deny client writes (admin-only via edge function)
```

This lets admins post updates like "Fighter A broke his wrist — odds shifted from 1.5x to 2.8x" that appear on the Match Center and optionally as a ticker on the card.

### Step 6: Link Cards to Match Center
**File:** `src/components/predictions/FightCard.tsx`

- Add a subtle "View Details →" link on each card that navigates to `/predictions/{fightId}`
- Show a small news indicator badge if `fight_updates` exist

---

## Technical Details

- No need to cancel existing events — re-enrichment updates NULL columns in-place
- Fighter photos come from external CDNs (BallDontLie, TheSportsDB) — no storage needed
- The Match Center page uses existing `stats_json` and new `fight_updates` for content
- Odds history could be stored by adding a `price_history` JSONB column or a separate `prediction_price_snapshots` table (populated by the existing polymarket-prices polling)
- All 3 API keys are already configured as secrets

