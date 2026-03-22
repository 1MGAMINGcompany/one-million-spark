

## Plan: Fix Polymarket Soccer Market Discovery

### Problem
The admin sync panel can't find the soccer matches you see on Polymarket's website. Two root causes:

1. **`limit=50` is far too low** — The sync fetches at most 50 events total across all sports tags combined. Polymarket has 120+ MLS markets alone, plus La Liga (14), EPL (12), Serie A (21), Ligue 1 (36), Bundesliga (35), etc. Most soccer markets never make it into your system.

2. **Missing soccer-specific tags** — Polymarket tags soccer markets under more specific tags like `"mls"`, `"epl"`, `"la-liga"`, `"serie-a"`, `"bundesliga"`, `"ligue-1"`, `"champions-league"` that aren't in the current `SPORTS_TAGS` array. The generic `"soccer"` and `"football"` tags may not cover all leagues.

### Changes

**1. `supabase/functions/polymarket-sync/index.ts`**
- Increase default limit from 50 → 200
- Add soccer-specific league tags to `SPORTS_TAGS`: `"mls"`, `"epl"`, `"la-liga"`, `"serie-a"`, `"bundesliga"`, `"ligue-1"`, `"champions-league"`, `"liga-mx"`
- Add pagination support: if Gamma returns exactly `limit` results for a tag, fetch the next page (offset-based)
- The existing deduplication by event ID already handles overlap between tags

**2. `src/pages/FightPredictionAdmin.tsx`**
- Add a `"soccer"` quick-tag button alongside existing tags so you can sync soccer-only
- Allow custom limit input (default 200) so you can pull more if needed
- Show per-tag breakdown in sync results (e.g., "MLS: 120, La Liga: 14, ...")

### Why Search Doesn't Find Them
The search action uses Gamma's `/public-search?q=...` endpoint which works for event-level searches. Individual game matches (like "Minnesota United vs Seattle Sounders") are **sub-markets within grouped events** — the event title might be "MLS March 22" with 50+ sub-markets inside it. Searching "Portland Timbers" should work, but searching "MLS" returns the parent event which contains all the individual matches.

The fix is primarily about the sync pulling more data, not search.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Add league-specific tags, increase limit to 200, add pagination |
| `src/pages/FightPredictionAdmin.tsx` | Add soccer quick-tag, configurable limit, better sync result display |

