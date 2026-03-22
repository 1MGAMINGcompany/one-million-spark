

## Plan: Integrate Polymarket Sports Series API for Reliable Fixture Discovery

### Problem
The current search-based discovery (`/public-search?q=soccer vs`) is unreliable — it returns futures markets, political noise, and misses actual fixtures. Meanwhile, the Gamma API already has a structured `/sports` endpoint that returns all sports with their `series` IDs, and `/events?series_id=X&active=true&closed=false` returns exactly the actual match fixtures you see on the Polymarket website.

### Discovery: What I Found

The Gamma API `/sports` endpoint returns structured data like:
```text
{ sport: "epl",  series: "10188" }   → Premier League fixtures
{ sport: "lal",  series: "10193" }   → La Liga fixtures
{ sport: "bun",  series: "10194" }   → Bundesliga fixtures
{ sport: "acn",  series: "10786" }   → Africa Cup of Nations
... and all other sports Polymarket supports
```

Querying `/events?series_id=10188&active=true&closed=false` returns actual fixtures like **"Manchester City FC vs. Crystal Palace FC"** — exactly what you want.

The **Data API** (`data-api.polymarket.com`) is primarily for user-level data (trades, positions, leaderboards). It does not have event discovery endpoints. The real fix is using the Gamma `/sports` + `/events?series_id=X` pipeline, which is what the Polymarket website itself uses.

### Changes

**1. `supabase/functions/polymarket-sync/index.ts` — Series-Based Discovery**

Replace the unreliable search-based approach with structured series-based fetching:

- **New `fetchSportsSeries()` function**: Calls `GET /sports` to get all available sports and their series IDs dynamically (no more hardcoded league search queries)
- **New `fetchSeriesEvents()` function**: For each series, calls `GET /events?series_id=X&active=true&closed=false&limit=50` to get actual upcoming fixtures
- **Update sync action**: When `tag === "soccer"`, fetch only soccer series (epl, lal, bun, etc.). When `tag === "sports"`, fetch all. When `tag === "mma"`, use combat series
- **Keep search as fallback**: The admin search action stays for manual discovery, but the main sync path uses series-based fetching
- **Remove `SOCCER_SEARCH_QUERIES`**: No longer needed — series IDs replace them
- **Keep fixture filter as safety net**: `isActualFixture()` stays as a secondary guard

- **Add Data API integration for enrichment**: After importing fixtures, optionally call `data-api.polymarket.com/trades?market=X` to pull volume/trade data for richer admin display

**2. `src/pages/FightPredictionAdmin.tsx` — Admin Sync UI Updates**

- **Update tag filter options**: Add a "Browse Sports" dropdown that lists available sports from the `/sports` endpoint, making it easy to sync specific leagues
- **Show series-based sync results**: Display which leagues were synced and how many fixtures per league

**3. `supabase/functions/polymarket-prices/index.ts`** (minor)

- Use Data API `GET /trades?market=X&limit=1` as an additional price fallback when CLOB prices are stale

### Files

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Replace search-based discovery with `/sports` + `/events?series_id=X` pipeline; add Data API trade enrichment |
| `src/pages/FightPredictionAdmin.tsx` | Add sport/league browser in sync panel; show per-league sync counts |

### Result
- Sync will discover **all actual fixtures** across all leagues Polymarket supports — automatically, no hardcoded query lists
- No more futures/winner markets polluting the admin
- New leagues added by Polymarket will appear automatically (dynamic from `/sports`)
- Data API trade data enriches admin view with real volume info

