

## Plan: Fix Cricket/Tennis/F1/UFC/Boxing Seeds, Bulk Import Resilience, Cleanup Tool, Pagination

### 1. Fix Search Seeds for Empty-Returning Sports

**File: `supabase/functions/polymarket-sync/index.ts` (lines 241-263)**

Update `LEAGUE_SOURCES` entries and add sub-leagues:

**Cricket** — Replace generic seeds, add sub-leagues, fix `sportType` from `"tennis"` to `"cricket"`:
- `"cricket"`: seeds `["Indian Premier League", "IPL vs", "PSL vs", "cricket vs", "T20 cricket vs"]`, sportType `"cricket"`
- `"cricket-ipl"`: seeds `["Indian Premier League", "IPL vs", "IPL 2026"]`
- `"cricket-psl"`: seeds `["Pakistan Super League", "PSL vs"]`
- `"cricket-intl"`: seeds `["cricket international", "cricket vs", "T20 international"]`

**Tennis** — Add sub-leagues, fix sportType on existing entries if needed:
- `"tennis"`: seeds `["ATP vs", "WTA vs", "Wimbledon", "US Open vs", "Roland Garros vs", "Australian Open vs", "tennis vs"]`
- `"tennis-atp"`: seeds `["ATP vs", "ATP Tour"]`
- `"tennis-wta"`: seeds `["WTA vs", "WTA Tour"]`
- `"tennis-grand-slam"`: seeds `["Wimbledon", "US Open vs", "Roland Garros vs", "Australian Open vs"]`

**Formula 1** — Fix `sportType` from `"golf"` to `"f1"`, improve seeds:
- Seeds: `["Formula 1 Grand Prix", "F1 vs", "Grand Prix winner"]`

**UFC** — Improve seeds:
- Seeds: `["UFC vs", "UFC Fight Night", "UFC"]`

**Boxing** — Improve seeds:
- Seeds: `["boxing vs", "WBC", "WBA", "IBF title", "boxing match"]`

**Rugby** — Fix sportType from `"tennis"` to `"rugby"`

Add `"cricket"`, `"f1"`, `"rugby"` to `SPORT_TYPE_TO_CATEGORY` (line ~776-788):
```
cricket: "CRICKET",
f1: "F1",
rugby: "RUGBY",
```

Also add `"f1"` to the `LeagueSource.sportType` union (line 208).

### 2. Add Sub-League Tabs to Frontend

**File: `src/pages/platform/PlatformAdmin.tsx` (lines 94-120)**

Add to `BROWSE_LEAGUES` array:
- `cricket-ipl`, `cricket-psl`, `cricket-intl`
- `tennis-atp`, `tennis-wta`, `tennis-grand-slam`

### 3. Fix Bulk Import — Chunked with Error Resilience

**File: `src/pages/platform/PlatformAdmin.tsx` (lines 258-287)**

Rewrite `handleBulkImport` to:
- Chunk selected events into batches of 10
- Call `import_bulk` sequentially per batch
- Track per-batch success/failure in state
- On batch failure: record the error, continue with remaining batches
- Show progress as `(completed batches / total batches)` on the Progress bar
- After completion, show summary: "X imported, Y failed"
- Add `failedBatches` state and a "Retry Failed" button that re-submits only the failed event IDs
- Keep successfully imported IDs in `importedIds` so they show "Already imported"

**File: `supabase/functions/polymarket-sync/index.ts` (lines 1443-1464)**

Cap `import_bulk` at 15 events. Skip `fetchMarketVolume` call during bulk to reduce latency. Batch dedup check: before the loop, query all `polymarket_condition_id` values for the incoming markets in one call and use an in-memory Set.

### 4. Cleanup Tool — "Remove Junk Events"

**File: `src/pages/platform/PlatformAdmin.tsx`**

Add a "Remove Junk Events" button in the Events Dashboard tab header area. On click:
1. Scan `fights` array client-side for matches against junk keywords in title: `over, under, o/u, CBA, MVP, award, champion, will they, how many, total, by Dec`
2. Also find fights with `event_date` > 3 days in the past AND `entryCounts[id] === 0`
3. Show a confirmation modal/toast with count: "Found X junk events. Delete?"
4. On confirm, call `prediction-admin` `deleteFight` for each junk fight ID (sequentially, with progress)
5. Reload fights after completion

### 5. Pagination / Load More for Polymarket Browser

**File: `supabase/functions/polymarket-sync/index.ts` (browse_league action, lines 1275-1318)**

The `fetchEventsByTagId` already paginates up to 500 events (5 pages x 100). For search-based strategies, update `fetchSearchEvents` to accept a higher limit (default 30 instead of current behavior which deduplicates across seeds).

Add `limit` and `offset` params to `browse_league` action body. Pass to `fetchEventsByTagId`. Return `has_more` flag.

**File: `src/pages/platform/PlatformAdmin.tsx`**

- Add `browseOffset` state (default 0)
- When clicking a sport tab, reset offset to 0
- Add "Load More" button at bottom of results that increments offset and appends new results (not replaces)
- Show result count: "Showing X events"

---

### Files Changed

1. `supabase/functions/polymarket-sync/index.ts` — Fix seeds for cricket/tennis/F1/UFC/boxing/rugby, fix sportType mappings, add sub-league entries, add SPORT_TYPE_TO_CATEGORY entries, cap bulk at 15 with batch dedup, add offset/limit to browse_league, skip fetchMarketVolume in bulk
2. `src/pages/platform/PlatformAdmin.tsx` — Add sub-league tabs, chunked bulk import with retry, cleanup tool, Load More pagination

