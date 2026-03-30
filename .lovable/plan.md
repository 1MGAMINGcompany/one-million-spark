

## Plan: Fix Prediction Admin + Predictions Query + Loading Timeout

### Summary of findings

After reviewing the full files:

1. **`prediction-admin/index.ts`**: `validatePromoCode` already exists before the admin check (line 30) — this is correct. But there's a **duplicate** `validatePromoCode` handler at line 1046 (after admin check) that is dead code and should be removed. The `createPromoCode` validation line at line 1018 is intact. No syntax errors found.

2. **`FightPredictions.tsx`**: The fights query (line 282) uses `.limit(200)` with no `.order()` — this is why future soccer events can be missed. Needs `.order('event_date', { ascending: true })` and limit bumped to 500. Also needs a 10-second client-side timeout wrapper.

### Changes

**File 1: `supabase/functions/prediction-admin/index.ts`**
- Remove the duplicate `validatePromoCode` block at lines 1046-1065 (dead code — the working copy is already at line 30 before the admin check)
- Fix indentation of the line-30 block to match the rest of the file
- No other changes

**File 2: `src/pages/FightPredictions.tsx`**
- Add `.order('event_date', { ascending: true })` to the fights query (line 278)
- Increase `.limit(200)` to `.limit(500)` (line 282)
- Wrap the `Promise.all` inside `loadFights()` with a 10-second `AbortController` timeout so the page never spins forever — on timeout, treat as failure (set `backendDegraded`, increment `consecutiveFailures`)

### Files changed
- `supabase/functions/prediction-admin/index.ts`
- `src/pages/FightPredictions.tsx`

