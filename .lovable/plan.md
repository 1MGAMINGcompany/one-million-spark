

## Plan: Fix Soccer Discovery — Use Search-Based Approach

### Root Cause (confirmed from logs)

1. **`?tag=soccer` returns wrong results** — Same problem as MMA/boxing tags. Polymarket's Gamma API tag system is unreliable for sports discovery.
2. **Search results show past events** — The search panel in admin displays all results from Gamma without filtering out past/ended events. Your screenshot shows Soccer Leagues Cup from Aug 2025.
3. **Only 5 results** — Searching "Soccer" is too generic. Need league-specific search terms.

### Changes

**1. `supabase/functions/polymarket-sync/index.ts`**

- **Remove ALL tag-based fetching** — Tags are unreliable for every sport. Delete `SPORTS_TAGS`, `fetchTagEvents`, and `fetchSportsEvents`.
- **Replace with unified search-based discovery** using two query lists:
  - `SOCCER_SEARCH_QUERIES`: `["MLS", "EPL", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Champions League", "Liga MX", "soccer"]`
  - `COMBAT_SEARCH_QUERIES`: (keep existing) `["UFC", "boxing", "ONE Championship", "PFL", "Bellator", "bare knuckle", "MMA"]`
- **When `tag === "sports"` or `tag === "soccer"`**: run search queries for soccer terms
- **When `tag === "mma"` or `tag === "boxing"`**: run combat search queries (unchanged)
- **Apply `isFutureEvent` filter** to ALL results before upserting — no past events ever get imported
- **Search results in the UI** (`action === "search"`): also filter out past events before returning to admin panel, so the preview never shows ended events

**2. `src/pages/FightPredictionAdmin.tsx`**

- No structural changes needed — the tag buttons and search already work. Just need the backend to return correct results.

### Files

| File | Change |
|------|--------|
| `supabase/functions/polymarket-sync/index.ts` | Replace tag-based fetch with search-based for soccer; filter past events from search results |

