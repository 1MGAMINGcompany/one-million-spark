

## Fix: Empty `SelectItem` value crashing admin page

### Problem
Line 2419 in `FightPredictionAdmin.tsx` has `<SelectItem value="">All sports (default)</SelectItem>`. Radix UI's `Select.Item` throws an error when `value` is an empty string — this is crashing the entire admin page.

### Changes

**File: `src/pages/FightPredictionAdmin.tsx`**

1. Change `<SelectItem value="">` to `<SelectItem value="__all__">` on line 2419
2. Update the `onValueChange` handler (line 2414) to treat `"__all__"` the same as empty — i.e., `setSelectedSeries(val === "__all__" ? "" : val)`

That's it — one-line root cause, two-line fix.

