

# Fix: Soccer Events Not Categorized as FUTBOL on Import

## Problem
When importing "South Africa vs Panama" from the FIFA Friendlies league, it shows up uncategorized because:
1. `importSingleEvent()` never sets the `category` field in `prediction_events`
2. The frontend `parseSport()` tries keyword detection on the title, but "South Africa vs Panama" contains no soccer keywords (MLS, FUTBOL, etc.)
3. `source_provider` is "polymarket" (not "api-football"), so that check also misses

## Solution

### 1. Pass `sportType` through to `importSingleEvent` (edge function)
- Update `importSingleEvent` signature to accept an optional `sportType` parameter
- Map sport types to category values: `soccer` → `FUTBOL`, `mma` → `MMA`, `boxing` → `BOXING`, `nfl` → `NFL`, etc.
- Set `category` on the `prediction_events` insert and update

### 2. Derive `sportType` at each call site
- **`browse_league` action**: Already has the `LeagueSource` config with `sportType` — pass it to `importSingleEvent`
- **`import_single` action**: Accept optional `sport_type` from the frontend request body; also try to infer from the event's Polymarket tags
- **`import_by_url` action**: If the URL was parsed from a sports league page, pass the sport type through
- **`url_preview` / `search` actions**: When events are displayed for selection, include the detected `sportType` so the frontend can pass it back on import

### 3. Frontend: pass sport context on import
- In `FightPredictionAdmin.tsx`, when importing selected events from a league browse, include the league's `sportType` in the `import_single` request body
- Store it as `sport_type` alongside `polymarket_event_id`

### 4. Backfill existing events
- When `importSingleEvent` updates an existing event (line 798), also set `category` if it's currently null

### Files Changed
- `supabase/functions/polymarket-sync/index.ts` — add `sportType` param to `importSingleEvent`, map to category, pass from all call sites
- `src/pages/FightPredictionAdmin.tsx` — pass sport context when calling `import_single`

