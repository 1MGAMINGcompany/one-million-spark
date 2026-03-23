

## Two Issues to Fix

### Issue 1: Browse shows past events instead of future-only

**Root cause**: `isDateEligible()` in `polymarket-sync/index.ts` (line 121-127) keeps events with past `startDate` if Polymarket still marks them `active=true`. Polymarket doesn't flip `active` to `false` immediately after a match ends, so completed FIFA Friendlies from Feb/Mar still pass through.

**Fix in `polymarket-sync/index.ts`**:
- For **browse_league** and **url_preview** modes, apply a strict date cutoff: if the event's best available date (`endDate` or `startDate`) is in the past, reject it regardless of `active` flag.
- Remove the `past_start_but_active` loophole from `isDateEligible`. An event with a past date should only be kept if it has NO date at all (show with warning badge).
- Updated logic:
  - `endDate` exists and is in the past → reject
  - `startDate` exists and is in the past AND no future `endDate` → reject
  - No dates at all → keep with warning
  - Future date → keep

### Issue 2: 3 approved Polymarket events don't appear on the predictions page

**Root cause**: The 3 events you approved today have zero `open` fights:
- **Club Atlético de Madrid vs. Real Sociedad** — 3 fights, all `cancelled` (event date was Mar 22, yesterday — auto-cancelled by the automation stack)
- **2026 FIFA World Cup Winner** — 60 fights, all `cancelled` or `locked` (futures market, automation locked/cancelled sub-markets)
- **MLS Cup Winner 2026** — 31 fights, all `cancelled` or `locked`

The predictions page groups fights by event. When ALL fights in a group are `cancelled`/`locked`, the group is classified as "past" (line 289-291 in `FightPredictions.tsx`) and goes into the collapsed Past Events section.

**Fix**: This is a data issue, not a code bug. The events were correctly auto-managed:
- Atletico Madrid match already happened yesterday — its fights should stay cancelled
- FIFA World Cup Winner and MLS Cup Winner are **futures/outright** markets (60+ sub-markets like "will Brazil win?"), not individual match fixtures. The automation stack locked/cancelled them because they're not standard matchup markets

**Action**: No code change needed for this. Instead:
1. The admin should import **actual upcoming match fixtures** (e.g., a specific La Liga game next week) rather than futures markets
2. For the FIFA World Cup and MLS Cup futures that were already approved — these can be cleaned up in the admin panel (dismiss/archive them)
3. I'll add a visible note in the admin UI when importing futures/outright markets (60+ sub-markets) warning that these aren't standard fixtures

### Implementation

**File: `supabase/functions/polymarket-sync/index.ts`**
- Rewrite `isDateEligible` to strictly reject past events: if the best date (endDate > startDate > market endDate) is before now, reject
- Remove the `past_start_but_active` exception

**File: `src/pages/FightPredictionAdmin.tsx`**
- Add a warning badge on preview cards with 20+ markets: "⚠️ Futures market — not a single fixture"
- Ensure the "Past" badge logic matches the stricter date filter so admins don't see events they can't usefully import

