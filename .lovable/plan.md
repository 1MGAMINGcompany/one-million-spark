

## Plan: Fix MMA/UFC Event Discovery in Polymarket Sync

### Root Cause

Polymarket's Gamma API tag system does not use `"mma"`, `"ufc"`, `"boxing"`, or `"fighting"` as tag slugs for combat sports. All of those tags return crypto/finance events (MicroStrategy, Kraken, etc.). UFC events are only discoverable via the `/public-search` endpoint.

I verified this by hitting the Gamma API directly:
- `?tag=mma` → MicroStrategy, Kraken (finance)
- `?tag=ufc` → MicroStrategy, Kraken (finance)
- `?tag=fighting` → MicroStrategy, Kraken (finance)
- `/public-search?q=UFC` → actual UFC Fight Night events with full market data

### Changes

**1. `supabase/functions/polymarket-sync/index.ts`**

Add a **search-based discovery step** alongside the existing tag-based sync:

- Add a new array `SEARCH_QUERIES` with terms like `"UFC"`, `"boxing"`, `"ONE Championship"`, `"PFL"`, `"Bellator"`, `"bare knuckle"`
- When `action === "sync"` and tag is `"sports"` or `"mma"` or `"boxing"`:
  - After the tag-based fetch, also run `/public-search?q=...` for each combat-sport query
  - Deduplicate results by event ID (same as existing tag dedup logic)
  - Feed combined results into the existing upsert pipeline
- Remove `"mma"` and `"boxing"` from `SPORTS_TAGS` since they return wrong results
- Add the search queries count to the audit log

**2. `src/pages/FightPredictionAdmin.tsx`**

- Update the quick-tag buttons: replace `"mma"` with a dedicated "UFC/MMA" button that triggers the search-based sync
- Show search-based discovery results separately in the sync output so you can see what came from tags vs. search

### Technical Detail

The search endpoint returns a different shape (`{ events: [...] }`) vs. the tag endpoint (raw array). The function already handles the search response format in the `action === "search"` branch — we reuse that parsing.

```text
Sync flow:
  1. Tag-based fetch (soccer leagues, NFL, NBA, etc.)
  2. Search-based fetch ("UFC", "boxing", "ONE Championship")
  3. Deduplicate by event ID
  4. Filter future events only
  5. Upsert into prediction_events + prediction_fights
```

### Files

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Add search-based discovery for combat sports, remove bad tags |
| `src/pages/FightPredictionAdmin.tsx` | Update quick-tags to trigger search-based MMA sync |

