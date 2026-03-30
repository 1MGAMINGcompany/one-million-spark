

## Plan: Rewrite Polymarket Import System Using Correct API Approach

### Summary
Complete rewrite of the browse/fetch logic in `polymarket-sync` to use Polymarket's correct API patterns: `tag_id=100639` for game-only filtering, `/sports` endpoint caching, proper pagination, and a winner-only market filter based on market `question` field analysis.

### Problems in Current Code
1. **Missing `MATCHUP_RE`** — The regex constant is referenced but never defined, meaning `hasMatchupPattern()` throws a ReferenceError and the filter silently breaks
2. **No `tag_id=100639`** — This is Polymarket's official game-bet-only filter; without it, futures/props/awards leak through
3. **No `/sports` caching** — Called fresh every browse click despite rarely changing
4. **`active=true` removes upcoming games** — Some upcoming events aren't marked active yet; should use `closed=false` only + future date filter
5. **Token IDs already stored** — `polymarket_outcome_a_token` / `polymarket_outcome_b_token` columns exist and are populated during import, so no migration needed

### Changes

#### 1. Rewrite `polymarket-sync/index.ts` — Core fetch functions

**Fix `MATCHUP_RE`** — Add the missing regex definition (line ~91):
```typescript
const MATCHUP_RE = /\bvs\.?\b|\sv\s/i;
```

**Rewrite `fetchEventsByTagId()`** — Add `tag_id=100639` for game-only filtering on automated sports:
```typescript
async function fetchEventsByTagId(tagId: string, useGameFilter = true, limit = 100): Promise<GammaEvent[]> {
  const allEvents: GammaEvent[] = [];
  const seen = new Set<string>();
  let offset = 0;
  const maxPages = 5;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      tag_id: tagId,
      closed: "false",
      limit: String(limit),
      offset: String(offset),
      order: "startDate",
      ascending: "true",
    });
    // tag_id=100639 filters to game matchups only (no futures/props)
    if (useGameFilter) params.set("tag_id", `${tagId}`);
    // Don't require active=true — upcoming games may not be active yet

    const url = `${GAMMA_BASE}/events?${params.toString()}${useGameFilter ? '&tag_id=100639' : ''}`;
    // ... pagination loop (same structure as current)
  }
  return allEvents;
}
```

Wait — Gamma API doesn't support multiple `tag_id` params in a single call. The correct approach: use `series_id` (from `/sports`) for automated leagues + `tag_id=100639` for game-only filtering. For manual sports (UFC/Boxing/Golf), use their specific `tag_id` alone.

**Revised approach:**

- For leagues that have a `series_id` (fetched from `/sports`): query with `series_id={id}&tag_id=100639`
- For leagues using tag-based fetch: query with `tag_id={sportTagId}` (no 100639, since those sports aren't in /sports)
- Add a `series_id` field to `LeagueSource` interface and populate it from a cached `/sports` call

**Add `/sports` cache** — In-memory cache with 1-hour TTL:
```typescript
let sportsCache: { data: any[]; ts: number } | null = null;
const SPORTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchSportsCached(): Promise<any[]> {
  if (sportsCache && Date.now() - sportsCache.ts < SPORTS_CACHE_TTL) return sportsCache.data;
  const data = await fetchSports();
  sportsCache = { data, ts: Date.now() };
  return data;
}
```

**Add winner-only market filter** — New function to replace the broken `isAcceptableEvent`:
```typescript
function findWinnerMarket(ev: GammaEvent): GammaMarketExt | null {
  for (const m of ev.markets || []) {
    const outcomes = safeJsonParse(m.outcomes);
    const question = (m.question || "").toLowerCase();
    if (outcomes.length < 2 || outcomes.length > 3) continue;
    const rejectWords = ["over","under","total","spread","ko","knockout",
      "goals","points","rounds","margin","first","how many","mvp","award",
      "draft","score","yards","assists","rebounds","hits","innings",
      "method","stoppage","submission","decision"];
    if (rejectWords.some(w => question.includes(w))) continue;
    if (question.includes("win") || question.includes("vs")) return m;
  }
  return null;
}
```

**Update `fetchByLeagueSource()`** — Use `series_id` + `tag_id=100639` for automated leagues:
- Look up `series_id` from cached `/sports` response
- If found: `?series_id={id}&tag_id=100639&closed=false&limit=100`
- If not found: fall back to current tag/search strategy

**Update `fetchAllActiveEvents()`** — Remove `active=true`, keep `closed=false` only

**Add manual sport tag IDs** — For UFC, Boxing, Golf, F1, Chess that aren't in `/sports`:
```typescript
const MANUAL_SPORT_TAGS: Record<string, string> = {
  ufc: "1637", boxing: "267", golf: "1349", f1: "1351", chess: "1376",
};
```

#### 2. Update `importSingleEvent()` — Use winner-only filter at market level

Replace the current per-market prop keyword check with `findWinnerMarket()` so only the winner market gets imported from multi-market events.

#### 3. Update `filterFixtures()` — Integrate winner-only check

Add `findWinnerMarket()` as an additional acceptance criterion: events that pass date/fixture checks must also have at least one winner market.

### Files Changed
1. `supabase/functions/polymarket-sync/index.ts` — Complete rewrite of fetch/filter logic with correct Polymarket API patterns

### No Migration Needed
The `polymarket_outcome_a_token` and `polymarket_outcome_b_token` columns already exist in `prediction_fights` and are already populated during import.

