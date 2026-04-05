

# Fix: Cricket Event Discovery + LIVE Status Accuracy

## Two Issues Found

### Issue 1: Cricket only shows 4 events (should be 70+)

**Root cause**: Cricket leagues use `fetchStrategy: "search"` with search seeds like `"IPL vs"`, `"PSL vs"`. But Polymarket's `/public-search` API returns almost zero results for these queries (it returns old 2023/2024 events). Meanwhile, Polymarket's `/sports` endpoint lists **proper series IDs** for every cricket league:

| League | Sport Key | Series ID | Open Events |
|--------|-----------|-----------|-------------|
| IPL | cricipl | 11213 | 36 |
| PSL | cricpsl | 11214 | 36 |
| Legends | criclcl | 11337 | 26 |
| T20 Brisbane | crictbcl | 11513 | 8 |

**Fix**: Switch all cricket league sources from `fetchStrategy: "search"` to `fetchStrategy: "tag"` with proper tag IDs extracted from the `/sports` endpoint's `tags` field. The `/sports` data gives us both the `series` ID and `tags` (which include the sport-specific tag ID alongside 100639). We use `series_id + tag_id=100639` which is the proven pattern already working for NBA, NHL, etc.

### Issue 2: LIVE status mismatch with Polymarket

**Root cause**: `getTimeLabel()` in `SimplePredictionCard.tsx` marks any event as "LIVE" if its `event_date` is in the past but within the last 3 hours. This is a rough heuristic. The Polymarket screenshot shows the same match as "0-0" (not started yet or just started), while our app shows "LIVE" — the times may differ because we stored the Polymarket `startDate` (market listing time) rather than the actual game kickoff time. The `chooseSportsDisplayTime` function has the right priority chain, but some events may have been imported before this fix was added, storing incorrect dates.

**Fix**: 
1. During daily import, always re-check and update `event_date` using `chooseSportsDisplayTime` even for existing events (not just new ones)
2. Add a `re-sync-dates` action to the sync function that updates event dates for all open fights using the Gamma API

## Plan

### Step 1: Update `LEAGUE_SOURCES` in `polymarket-sync/index.ts`

Replace all cricket league entries from search-based to series-based discovery using the tag IDs from Polymarket's `/sports` endpoint:

```
"cricket-ipl":    series="11213", tags from "1,100639,517,101988" → tagId="101988"
"cricket-psl":    series="11214", tags "103805" → tagId="103805"
"cricket-lcl":    series="11337", tagId="104203"
"cricket-tbcl":   series="11513", tagId="104447"
```

Also add newly discovered leagues (CPL, SA20, T20 Blast, etc.) that Polymarket supports but we don't import yet.

Change `fetchStrategy` from `"search"` to `"tag"` and add the `tagId` and/or `seriesId` fields. The existing `fetchByLeagueSource` already handles series_id + tag_id=100639 lookup, so these will immediately start using the proper API.

### Step 2: Add cricket leagues to daily import batches

Add the new cricket league keys (criclcl, crictbcl, etc.) to `BATCH_1` and `PLATFORM_ONLY_KEYS` in the `daily_import` action.

### Step 3: Fix event_date accuracy for existing events

In `importSingleEvent`, when an existing event is found, also update `event_date` if the Gamma API provides a newer/different timestamp. This prevents stale market listing dates from causing wrong LIVE status.

### Step 4: Run initial sync

After deploying, trigger a manual `daily_import` batch=1 to populate the new cricket events.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Update cricket LEAGUE_SOURCES to use tag/series IDs; add new cricket leagues; fix event_date updates for existing events |

## Scope
- 1 file edited (polymarket-sync edge function)
- No database changes
- No UI changes needed (events will auto-appear once imported)
- No new API keys

