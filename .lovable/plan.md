

## Issues

1. **FUTBOL tab shows "SOON"**: Line 415 in `FightPredictions.tsx` calls `parseSport(e)` without passing `source_provider`, so soccer events aren't recognized as FUTBOL. The tab incorrectly shows "SOON".

2. **Inconsistent count labels**: Some event cards show "12 Fights 12 Open" while others show "14 Fights" + "14 Open". The open count should include the sport-aware noun for consistency, e.g., "14 Open Fights".

## Changes

### 1. Fix FUTBOL tab "SOON" label (`src/pages/FightPredictions.tsx`)

Line 415 — update `hasEvents` to pass `source_provider`:
```typescript
const hasEvents = sport === "ALL" || Object.entries(groupedEvents).some(
  ([e, val]) => parseSport(e, val.event?.source_provider) === sport
);
```

### 2. Fix open count to include sport noun (`src/components/predictions/EventSection.tsx`)

Line 161 — change from:
```
{openCount} Open
```
to:
```
{openCount} Open {getSportItemLabel(sport, openCount)}
```

This ensures consistency: "14 Open Fights", "12 Open Matches", etc.

Both changes are UI-only.

