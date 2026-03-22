## Plan: Fix MMA/UFC Event Discovery in Polymarket Sync — COMPLETED

### What Changed

1. **`supabase/functions/polymarket-sync/index.ts`**
   - Removed `"mma"` and `"boxing"` from `SPORTS_TAGS` (they return crypto/finance events)
   - Added `COMBAT_SEARCH_QUERIES` array: `"UFC"`, `"boxing"`, `"ONE Championship"`, `"PFL"`, `"Bellator"`, `"bare knuckle"`, `"MMA"`
   - Added `fetchSearchEvents()` function using Gamma's `/public-search` endpoint
   - When syncing `"sports"`: tag-based + search-based discovery merged with dedup
   - When syncing `"mma"` or `"boxing"`: search-only discovery
   - Added `search_events_found` to audit log and response

2. **`src/pages/FightPredictionAdmin.tsx`**
   - "mma" tag shows as "UFC / MMA (search)" 
   - "boxing" tag shows as "Boxing (search)"
   - Sync results show search-based discovery count

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Remove mma/boxing from SPORTS_TAGS, add COMBAT_SEARCH_QUERIES, add fetchSearchEvents, search-only for mma/boxing |
| `src/pages/FightPredictionAdmin.tsx` | mma tag shows as UFC/MMA (search), boxing tag shows as Boxing (search), sync results show search-based discovery count |
