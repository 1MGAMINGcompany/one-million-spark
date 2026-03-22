

## Plan: Filter to Only MMA, Boxing, Bare Knuckle, Soccer — Future Events Only

### Problem
The admin panel shows political events, past events, and sports you don't care about (NFL, NBA, cricket, etc.). You only want **MMA, Boxing, Bare Knuckle, and Soccer** events that are **in the future** (not today or yesterday).

### Changes

**1. `supabase/functions/polymarket-sync/index.ts`**

- **Strip SPORTS_TAGS down to soccer only**: Remove `"sports"`, `"nfl"`, `"nba"`, `"mlb"`, `"tennis"`, `"cricket"`, `"football"` (American football). Keep only: `"soccer"`, `"mls"`, `"epl"`, `"la-liga"`, `"serie-a"`, `"bundesliga"`, `"ligue-1"`, `"champions-league"`, `"liga-mx"`
- **Tighten `isFutureEvent`**: Instead of accepting events with no `endDate`, check both `startDate` and `endDate`. An event must have at least one date in the future (>24h from now) to be included. Events with no dates at all still pass through (rare).
- **Add "bare knuckle" to COMBAT_SEARCH_QUERIES** (already there — confirmed)
- **When `tag === "sports"`, only fetch soccer tags + combat search** — no generic "sports" tag fetch that pulls politics/crypto

**2. `src/pages/FightPredictionAdmin.tsx`**

- **Remove unwanted tag buttons**: Remove `"politics"`, `"crypto"`, `"entertainment"`, `"science"` from the TAGS array
- **Keep only**: `"sports"` (renamed to "All"), `"soccer"`, `"mma"`, `"boxing"`
- The "sports" option will sync soccer + combat sports only (no NFL/NBA/politics)

**3. Auto-cleanup: tighten stale event window**

- Change the 48h stale cutoff to **0h** — any event whose `event_date` is in the past gets its open fights cancelled immediately during sync
- This removes yesterday's and today's finished events from cluttering the admin panel

### Files

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Restrict SPORTS_TAGS to soccer leagues only, tighten future-event filter to >24h, reduce stale cutoff to 0h |
| `src/pages/FightPredictionAdmin.tsx` | Remove politics/crypto/entertainment/science tags, keep only All/Soccer/MMA/Boxing |

