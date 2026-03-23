

## Fix: Admin Search Returns Irrelevant Results (Political Instead of Sports)

### Problem
When searching "FIFA Friendlies", the `/public-search` Gamma API endpoint returns 165 unrelated results (political markets like "Macron out by...?", "Ukraine recognizes Ru..."). This is because Polymarket's public search is a generic text search across ALL markets — it does not understand sport/league context.

### Root Cause
The `search` action in `polymarket-sync` relies entirely on Gamma's `/public-search` endpoint, which is a broad text search. For sports leagues, the correct approach is **series-based discovery** via the `/sports` endpoint, which returns `series_id` values that can be used with `/events?series_id=X` to get actual match fixtures.

From Polymarket's API docs:
```text
GET /sports                                    → returns series IDs per league
GET /events?series_id=10345&active=true        → returns fixtures for that league
GET /events?series_id=10345&tag_id=100639      → filters to game bets only (not futures)
```

### Changes

**File: `supabase/functions/polymarket-sync/index.ts`**

1. **Rewrite `search` action logic**: Before falling back to `/public-search`, first check if the query matches any known sport/series from `/sports`. If it does, use `series_id`-based lookup to return actual fixtures instead of generic search results.

2. **Add series name matching**: Compare the search query against sport labels and series names from `/sports` (e.g., "FIFA Friendlies" would match a series with label containing "FIFA" or "Friendlies"). Use fuzzy matching (lowercase substring check).

3. **Filter results for sports**: When results come from series-based discovery, apply the existing `isActualFixture` filter to exclude futures markets and only show "Team A vs Team B" style events.

4. **Keep `/public-search` as final fallback**: If no series matches, still use `/public-search` but limit results to events that look like actual sports fixtures (contain "vs") when the query appears to be sports-related.

**File: `src/pages/FightPredictionAdmin.tsx`**

5. **Show result source**: Display whether results came from series-based discovery ("League fixtures") vs generic search, so the admin knows what they're looking at.

### Technical Detail

The search flow becomes:
```text
User types "FIFA Friendlies"
  → Step 1: GET /sports → find series where label/sport matches "FIFA" or "Friendlies"
  → Step 2: GET /events?series_id=X&active=true&closed=false → real fixtures
  → Step 3: Filter with isActualFixture() → only "Team A vs Team B" events
  → Step 4 (fallback): If no series match, use /public-search + tag fallback
```

This ensures the admin sees actual soccer match fixtures instead of 165 political prediction markets.

