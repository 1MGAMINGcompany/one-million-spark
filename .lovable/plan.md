

# Fix Sport Categorization & Menu Order

## Issues
1. **Mayweather event not in BOXING** — Event name "Floyd Mayweather vs. Manny Pacquiao 2" has no keyword match in `parseSport`. The `category` column on `prediction_events` exists and the admin can set it, but the frontend ignores it.
2. **Menu order wrong** — Currently: ALL, MMA, FUTBOL, BOXING, MUAY THAI, BARE KNUCKLE. Requested: ALL, MUAY THAI, BARE KNUCKLE, MMA, BOXING, FUTBOL.
3. **No manual override** — When an event doesn't match any keyword, the admin-set `category` field should be respected.

## Changes

### 1. Update `parseSport` to accept and prioritize `category` (EventSection.tsx)
Add an optional `category` parameter to `parseSport`. If `category` is a valid sport string, return it immediately before keyword detection. This makes the admin-set category the highest priority override.

```typescript
function parseSport(eventName: string, sourceProvider?: string | null, category?: string | null): string {
  // Admin manual override
  if (category && ["MMA","BOXING","MUAY THAI","BARE KNUCKLE","FUTBOL","BASKETBALL"].includes(category.toUpperCase())) {
    return category.toUpperCase();
  }
  // ... existing keyword logic
}
```

### 2. Pass `category` through all `parseSport` call sites
Update callers in:
- **EventSection.tsx** — pass `event?.category`
- **FightPredictions.tsx** — pass `val.event?.category` in all `parseSport` calls
- **HomePredictionHighlights.tsx** — pass event category
- **sportLabels.ts** — add optional category param

### 3. Reorder menu tabs
- **FightPredictions.tsx**: Change `ALL_SPORTS` to `["ALL", "MUAY THAI", "BARE KNUCKLE", "MMA", "BOXING", "FUTBOL"]`
- **HomePredictionHighlights.tsx**: Change `SPORT_TABS` to match the same order

### 4. Set Mayweather event category in database
Update the `prediction_events` row for the Mayweather event to set `category = 'BOXING'`.

### Technical Details
- **Files modified**: `EventSection.tsx`, `FightPredictions.tsx`, `HomePredictionHighlights.tsx`, `sportLabels.ts`
- **Database**: 1 UPDATE to set category on Mayweather event
- No schema changes needed

