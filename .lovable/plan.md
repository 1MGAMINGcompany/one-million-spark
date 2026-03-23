

## Fix: Polymarket Admin URL Import and Search Not Finding Events

### Root Cause

Two bugs in `polymarket-sync/index.ts`:

**1. URL import fails for sports pages:** The user pastes `https://polymarket.com/sports/fifa-friendlies/games`, but the regex on line 773 only matches `/event/` URLs. Sports pages use `/sports/{slug}/games` — a completely different path. The slug extraction either fails or produces garbage.

**2. Search returns nothing for series names:** Searching "FIFA Friendlies" via Gamma's `/public-search` endpoint doesn't return individual match fixtures. It may return the old parlay event or nothing. The actual fixtures live under the **tag** system — `GET /events?tag=fifa-friendly&active=true&closed=false` returns the real matches (Vietnam vs Bangladesh, etc.).

I verified this by testing the Gamma API directly:
- `/events?slug=fifa-friendlies` → Returns an old 2025 parlay, not current fixtures
- `/events?tag=fifa-friendly&active=true&closed=false` → Returns actual upcoming matches

### Changes

**File: `supabase/functions/polymarket-sync/index.ts`**

1. **Fix `import_by_url` URL parsing** (line 773): Add a regex for `/sports/{slug}` URLs. When detected, convert the slug to a tag format and use `/events?tag={tag}&active=true&closed=false` to fetch all fixtures in that sport/league — bulk import instead of single event.

2. **Fix `search` action** (line 628): Add a fallback — when `/public-search` returns 0 results, retry using `/events?tag={query-as-slug}&active=true&closed=false`. This catches cases like "FIFA Friendlies" → tag `fifa-friendly`.

3. **URL pattern support**: Handle all three Polymarket URL formats:
   - `/event/{slug}` — existing, works (single event import)
   - `/sports/{slug}` or `/sports/{slug}/games` — NEW: bulk import via tag
   - Plain slug text — try event slug first, then tag fallback

**File: `src/pages/FightPredictionAdmin.tsx`**

4. **Show import count for sports URLs**: When a sports URL bulk-imports multiple fixtures, show a more descriptive success message (e.g., "Imported 12 fixtures from FIFA Friendlies").

### Technical Detail

The Gamma API tag slug uses a slightly different format than the URL slug (e.g., URL: `fifa-friendlies`, tag: `fifa-friendly`). The fix will try multiple slug variations: exact, without trailing 's', and with common suffix changes. It will also try `/events?tag_slug={slug}` as a parameter.

