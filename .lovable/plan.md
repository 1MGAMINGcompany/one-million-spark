## Plan: Integrate Polymarket Sports Series API for Reliable Fixture Discovery

### Status: ✅ Implemented

### Changes Made

**1. `supabase/functions/polymarket-sync/index.ts` — Series-Based Discovery**
- Added `fetchSportsSeries()` — calls `GET /sports` to get all available sports and series IDs dynamically
- Added `fetchSeriesEvents()` — calls `GET /events?series_id=X&active=true&closed=false` for actual fixtures
- New `browse_sports` action — returns available sports/series for admin UI dropdown
- Sync action now uses series-based discovery for soccer/sports, search for combat
- Supports `series_id` param for syncing a specific league
- Added Data API (`data-api.polymarket.com`) enrichment for trade volume on new imports
- Removed hardcoded `SOCCER_SEARCH_QUERIES` — replaced by dynamic series IDs
- Sync response now includes `discovery_method`, `series_synced`, and `series_stats`
- All existing cleanup logic (futures filter, stale cleanup, fixture guard) retained

**2. `src/pages/FightPredictionAdmin.tsx` — Admin Sport Browser**
- Added "Browse Sports" dropdown populated from `/sports` endpoint
- Admin can sync specific leagues individually or all at once
- Sync results now show per-league event counts and discovery method
- Tag selector updated with "(series)" / "(search)" hints

**3. `supabase/functions/polymarket-prices/index.ts` — Data API Price Fallback**
- Added Data API `activity?market=X` as tertiary price source after Gamma and CLOB
- Uses `lastTradePrice` from Data API when both Gamma and CLOB return no prices

### Result
- Soccer fixtures discovered via structured series pipeline (same as Polymarket website)
- New leagues added by Polymarket appear automatically
- No more futures/winner markets polluting imports
- Admin can browse and sync individual leagues
- Data API provides additional price resilience
