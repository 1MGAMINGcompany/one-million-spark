

## Problem

The MLS event name is `"MLS: Chicago Fire vs DC United"` which uses `:` as separator. The `parseSport()` function splits on ` — ` (em-dash), so it returns the full string instead of `"FUTBOL"`. This means the soccer ball icon and FUTBOL sport category are never matched.

## Fix

Two changes needed:

### 1. Update `parseSport()` in `EventSection.tsx`
Add keyword matching so that event names containing "MLS", "soccer", or "futbol" (case-insensitive) map to `"FUTBOL"`, and similarly "UFC" maps to `"MMA"`:

```typescript
function parseSport(eventName: string): string {
  const upper = eventName.toUpperCase();
  if (upper.includes("MLS") || upper.includes("SOCCER") || upper.includes("FUTBOL")) return "FUTBOL";
  if (upper.includes("UFC") || upper.includes("MMA")) return "MMA";
  if (upper.includes("BOXING")) return "BOXING";
  if (upper.includes("MUAY THAI")) return "MUAY THAI";
  const parts = eventName.split(' — ');
  return parts[0] || "OTHER";
}
```

### 2. Update `PredictionHighlights.tsx`
If `PredictionHighlights` has its own sport detection logic, apply the same keyword-based mapping there.

No database changes. No wallet/claim/admin logic touched.

