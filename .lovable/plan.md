

# Fix: Events Not Appearing in /demo

## Root Cause

The database query in `OperatorApp.tsx` (line 99-106) fetches the **oldest 200 events** ordered by `event_date ASC` with no date floor. There are **189 stale events** (some from July 2025) with status still set to `open`/`locked` that consume almost the entire 200-row limit. After client-side date filtering removes these past events, only ~11 future events survive — which is exactly what the screenshot shows.

Meanwhile, **360 valid future events** exist in the database (NHL 77, MLB 33, Soccer 100+, NBA 17, Cricket 5, UFC 7, etc.).

## Fix (Single Safe Change)

**File: `src/pages/platform/OperatorApp.tsx`** — Add a date floor to the Supabase query so stale events don't consume the row limit, and increase the limit to capture all valid inventory.

### Change 1: Add date lookback filter + raise limit

In the query (lines 99-106), add `.gte("event_date", ...)` with a 7-day lookback window (matching the existing convention used in prediction-feed) and increase the limit from 200 to 500:

```typescript
const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
const { data } = await (supabase as any)
  .from("prediction_fights")
  .select("*, prediction_events!event_id(category)")
  .or(`operator_id.eq.${operator!.id},and(operator_id.is.null,visibility.in.(platform,all))`)
  .in("status", ["open", "live", "locked"])
  .not("event_date", "is", null)
  .gte("event_date", cutoff)
  .order("event_date", { ascending: true })
  .limit(500);
```

This single change will surface all 360+ valid future events including NHL, Cricket (IPL), Soccer (Brasileirão, Libertadores, Eredivisie, J-League, etc.), MLB, NBA, UFC, and Boxing.

### What was blocking each sport

| Sport | Events in DB | Why hidden |
|-------|-------------|------------|
| NHL | 77 | Crowded out by 189 stale rows |
| Soccer (15+ leagues) | 100+ | Same — stale rows consumed limit |
| Cricket (IPL) | 5 | Same |
| MLB | 33 | Partially visible (4 shown) |
| NBA | 17 | Partially visible (3 shown) |
| UFC/MMA | 7 | Crowded out |

### What this does NOT change
- No payment, auth, or routing changes
- No validation weakening — `isValidOperatorEvent` and `normalizeOperatorSport` still filter client-side
- No schema changes
- Props (toss-winner, draw-only, Yes/No) continue to be filtered by existing client-side validation

