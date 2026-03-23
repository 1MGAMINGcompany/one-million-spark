

## Fix: Past Events Still Showing — Root Cause Found

### Problem

The screenshot shows FIFA Friendlies events from **Feb 26–27** (a month ago) still appearing in admin browse results. Telemetry confirms: 55 out of 110 events pass the filter. The "tomorrow" cutoff is not working.

### Root Cause

`isDateEligible` uses `Math.max(ev.endDate, ev.startDate)`. On Polymarket, the event-level `endDate` is the **market resolution window** (often weeks/months after the match), NOT the match date. For a FIFA Friendly on Feb 27, the `startDate` is Feb 27 (correct) but `endDate` might be April 2026 (market expiry). `Math.max` picks the future `endDate`, so the past match passes.

**The previous fix removed child market dates but kept event-level `endDate` — which suffers the same problem at the event level.**

### Fix

**File: `supabase/functions/polymarket-sync/index.ts` — rewrite `isDateEligible`**

Change the logic to **prioritize `startDate`** (the actual match date):
1. If `startDate` exists → use it as the match date. If it's before tomorrow → reject.
2. Only fall back to `endDate` if `startDate` is missing.
3. If neither exists → reject (hide undated).

```typescript
function isDateEligible(ev: GammaEvent) {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const cutoff = tomorrow.getTime();

  // startDate = actual match/event time on Polymarket
  // endDate = market resolution window (can be weeks/months later)
  // Always prefer startDate when available
  const startMs = ev.startDate ? new Date(ev.startDate).getTime() : null;
  const endMs = ev.endDate ? new Date(ev.endDate).getTime() : null;

  if (startMs && !isNaN(startMs)) {
    if (startMs >= cutoff) return { eligible: true, reason: "future_start", missingDate: false };
    return { eligible: false, reason: `past_start: ${ev.startDate}`, missingDate: false };
  }

  // No startDate — fall back to endDate (less reliable)
  if (endMs && !isNaN(endMs)) {
    if (endMs >= cutoff) return { eligible: true, reason: "future_end_no_start", missingDate: false };
    return { eligible: false, reason: `past_end: ${ev.endDate}`, missingDate: false };
  }

  return { eligible: false, reason: "no_event_date", missingDate: true };
}
```

### Database Cleanup

Archive the 7 stale approved Polymarket events (all past) and cancel their remaining locked/open fights:

1. **Update** `prediction_events` → set `status = 'archived'` for the 6 past Polymarket events (all except Floyd Mayweather which is Sep 2026)
2. **Update** `prediction_fights` → set `status = 'cancelled'` for any remaining `open` or `locked` fights under those archived events

Events to archive:
- Club Atlético de Madrid vs. Real Sociedad (Mar 22)
- Real Sociedad B vs. Granada CF (Mar 22)
- UFC Fight Night x3 (Mar 22)
- MLS Cup Winner 2026 (Feb 17 — futures)
- 2026 FIFA World Cup Winner (Jul 2025 — futures)

Floyd Mayweather vs. Pacquiao 2 (Sep 2026) stays approved.

### Files Modified
- `supabase/functions/polymarket-sync/index.ts` — rewrite `isDateEligible` to prioritize `startDate`
- Database: archive 7 past events + cancel their stale fights

