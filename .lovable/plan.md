

## Fix: Undefined `PROP_KEYWORDS` Crashing Polymarket Admin Import

### Root Cause

In `supabase/functions/polymarket-sync/index.ts`, line 539 references `PROP_KEYWORDS` which **was never defined**. This causes a `ReferenceError` that crashes the `import_single` action -- meaning every "Import Selected" click, every URL import, and every single-event import fails with a 500 error.

The preview/browse/search actions work fine (they don't call `importSingleEvent`), but the moment you click any import button, it calls `import_single` which hits the undefined variable and crashes.

### Fix

**File: `supabase/functions/polymarket-sync/index.ts`**

Add the missing `PROP_KEYWORDS` constant after the existing `HARD_EXCLUDE_KEYWORDS` array (around line 22). This should contain the same prop-market keywords that `HARD_EXCLUDE_KEYWORDS` uses for event-level filtering, applied at the individual market level during import:

```typescript
const PROP_KEYWORDS = [
  "winning method",
  "method of victory", 
  "total rounds",
  "spread",
  "moneyline alt",
  "over/under",
  "handicap",
];
```

This is a one-line-group addition. No other files need changes. The edge function must be redeployed after the fix.

