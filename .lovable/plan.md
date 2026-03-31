

## Fix: Widen Date Filter from 1 Hour to 7 Days

### Problem
The `.gt("event_date", now - 1 hour)` filter excludes nearly all 241 future events that have `event_date` values more than 1 hour in the past. This causes empty results → `backendDegraded = true` → on-hold banner.

### Changes

**File 1: `src/pages/FightPredictions.tsx` (line 245)**
- Change `Date.now() - 3600000` → `Date.now() - 86400000 * 7` (7 days back)

**File 2: `src/pages/Home.tsx` (line 48)**
- Same change: `Date.now() - 3600000` → `Date.now() - 86400000 * 7`

**File 3: `supabase/functions/prediction-feed/index.ts` (line 52)**
- Change `Date.now() - 3600000` → `Date.now() - 86400000 * 7`

**Timeout — already correct:**
The client timeout in `FightPredictions.tsx` is already set to 30 seconds (line 234). No change needed there.

### What this does NOT change
- No visibility filter changes
- No on-hold banner logic changes
- No edge function logic changes beyond the date filter
- No query structure changes

### Files changed
- `src/pages/FightPredictions.tsx`
- `src/pages/Home.tsx`
- `supabase/functions/prediction-feed/index.ts`

