

## Fix: "Live" Events From Previous Days Still Showing in LIVE NOW

### Root Cause

In `FightPredictions.tsx` line 218-227, the stale-live guard only demotes events that started **more than 24 hours ago**. Brentford vs Wolves started Mar 16 at 4:00 PM EDT (~19 hours ago), so it passes the 24h threshold and stays in **LIVE NOW**.

The fix: a "live" event from a **previous local calendar day** should never remain in LIVE NOW. No real match stays live overnight.

### Change

**`src/pages/FightPredictions.tsx`** — lines 218-224

Replace the single stale-live check with a two-condition guard:

```typescript
// Stale-live: started >6h ago OR on a previous calendar day
const isStaleLive = eventMs != null && (
  (nowMs - eventMs) > 6 * 60 * 60 * 1000 ||
  new Date(eventMs).toDateString() !== todayStr
);
```

This ensures:
- Any "live" event from yesterday or earlier → demoted to AWAITING RESULTS
- Any "live" event older than 6 hours (even if same calendar day) → demoted (no real match lasts 6h)
- Genuinely live events within today remain in LIVE NOW

One line change, no other files affected.

