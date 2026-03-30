
Fix the issue in two parts:

1. Stop the endless loading/failure loop on `/predictions`
2. Restore the missing future soccer/futbol events

What’s actually happening
- The page is repeatedly hitting backend reads that are failing with `PGRST002: Could not query the database for the schema cache. Retrying.`
- That means this is not just a UI bug; the page needs to handle backend instability much more defensively.
- Separately, your future soccer events are not deleted. They still exist in the database, but most future public fights are currently `visibility = "platform"`.
- The preview app is running in flagship mode, and the current queries only load `["flagship", "all"]`, so those `platform` events are being filtered out before they ever render.

Evidence found
- Future FUTBOL events still exist and are approved.
- Most future public fights are `platform`, not `all` or `flagship`.
- `FightPredictions.tsx` currently filters fights with:
  - `.in("visibility", ["flagship", "all"])`
- `Home.tsx` does the same.
- Platform admin already uses the opposite filter:
  - `.in("visibility", ["platform", "all"])`
- So the preview is hiding 1MG.live events by design right now.

Implementation plan

1. Update flagship preview predictions queries to include platform-visible events
- In `src/pages/FightPredictions.tsx`, change the fights query so preview/local/flagship can see platform events too.
- Replace the current visibility filter with one that includes:
  - `platform`
  - `all`
  - and, if needed, `flagship`
- This ensures the preview shows the same future soccer inventory you expect.

2. Do the same for homepage prediction highlights
- In `src/pages/Home.tsx`, update the prediction highlights query to include `platform` events too.
- That keeps homepage previews aligned with the full predictions page.

3. Make `/predictions` fail open instead of looking broken
- Keep `setLoading(false)` on any failure, but also preserve/render the last successful fights/events payload instead of appearing empty forever.
- Add a clearer degraded-state branch:
  - if backend is unhealthy and cached/local state exists, still render that data
  - only show the big “temporarily unavailable” empty state when there is truly nothing to display
- This prevents the page from feeling stuck while backend schema cache issues are happening.

4. Reduce pressure from repeated failed reloads
- In `FightPredictions.tsx`, add a short client cooldown/backoff when `loadFights()` fails with `PGRST002`.
- Avoid immediately hammering the backend every realtime trigger + polling cycle when the schema cache is unavailable.
- Keep polling, but slower after repeated failures.

5. Harden live stats so it never blocks perceived page readiness
- `useLiveStats` / `live-stats` already fail independently, but I would make the UI always render a fallback line such as:
  - live now: `0`
  - last 24h: `0`
  when stats fail
- This avoids the “something is broken” feeling in the hero section.

6. Add explicit visibility intent to predictions screens
- Add a small shared helper for prediction visibility selection so flagship and platform behavior is deliberate instead of duplicated ad hoc strings in multiple files.
- This reduces future regressions where imported events exist but vanish due to mismatched visibility filters.

Files to update
- `src/pages/FightPredictions.tsx`
- `src/pages/Home.tsx`
- `src/hooks/useLiveStats.ts`
- optionally a small shared helper such as:
  - `src/lib/predictionVisibility.ts`

Technical notes
- Root cause A: backend instability
  - `PGRST002` is a backend schema-cache/readiness failure, so the UI must tolerate temporary read failures.
- Root cause B: wrong visibility filter for the environment you are testing
  - current preview/flagship query: `["flagship", "all"]`
  - your future soccer inventory is mostly `platform`
  - result: the events appear “gone” even though they still exist
- No database migration is required for this fix.
- No queue rewrite is needed for this specific symptom; the biggest visible problem is the filtering mismatch plus weak frontend degradation behavior.

Expected result after implementation
- `/predictions` stops looking like it loads forever
- Future soccer/futbol events show up again in preview
- Temporary backend schema-cache outages degrade gracefully instead of making the whole screen feel broken
