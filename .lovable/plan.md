

## Issues Found

1. **Event cards start expanded** — `EventSection` initializes `expanded` to `true` if any fight is open (line 102). All cards with open fights auto-expand on page load.

2. **FUTBOL "Coming Soon" shows despite having soccer events** — `comingSoonSports` at line 240 calls `parseSport(e)` without passing `source_provider`, so soccer events aren't detected as FUTBOL, and the card still appears.

3. **PFL events categorized as "OTHER" instead of MMA** — `parseSport()` only checks for "UFC" and "MMA" keywords. PFL (Professional Fighters League) events don't match, falling through to the default branch which returns the event name prefix. This also causes `getSportItemLabel` to return "Games" instead of "Fights".

## Plan

### 1. Close all event dropdowns by default (`EventSection.tsx`)
- Change line 102 from `useState(hasOpen)` to `useState(false)` so all event cards are collapsed when users land on the predictions page.

### 2. Add PFL + Bellator + ONE to MMA detection (`EventSection.tsx`)
- In `parseSport()`, add "PFL", "BELLATOR", and "ONE" as MMA keywords alongside "UFC" and "MMA". This ensures PFL events get the MMA icon and "Fights" label.

### 3. Fix `comingSoonSports` to pass `source_provider` (`FightPredictions.tsx`)
- Update line 240 to pass the event's `source_provider` into `parseSport()` so soccer events are correctly detected:
  ```
  const existingSports = new Set(
    Object.entries(groupedEvents).map(([key, val]) => parseSport(key, val.event?.source_provider))
  );
  ```
- Also fix line 480 similarly so the condition check uses provider-aware detection.

All changes are UI-only. No backend, wallet, or settlement logic is touched.

