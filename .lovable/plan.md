

## Fix: Stale LIVE Soccer Events + Terminology Audit

### Analysis

**Stale LIVE guard**: The categorization logic (lines 212-229 of `FightPredictions.tsx`) pushes any event with a `status === "live"` fight directly into the LIVE NOW bucket with no date check. A match from March 15 with `status = "live"` still appears under LIVE NOW on March 16.

**Terminology**: Already correctly handled. `sportLabels.ts` returns "Match/Matches" for FUTBOL/SOCCER, and `EventSection.tsx` uses `getSportItemLabel()` for all user-facing counts. `FightCard.tsx` shows "Match Prediction" for soccer headers. All remaining "fight" references are internal code (variable names, types, props) — not user-visible. No terminology changes needed.

---

### Plan

#### Part 1 — Stale-live guard in `FightPredictions.tsx`

In the categorization `useMemo` (line 212-229), modify the `hasLive` branch:

```
if (hasLive) {
  const eventDate = group.event?.event_date;
  const isStaleLive = eventDate && (Date.now() - new Date(eventDate).getTime()) > 24 * 60 * 60 * 1000;

  if (isStaleLive) {
    // Debug warning for stale rows
    console.warn('[predictions] stale-live event demoted:', {
      eventName, eventDate, status: 'live'
    });
    today.push([eventName, group]);
  } else {
    live.push([eventName, group]);
  }
}
```

This demotes events with `status=live` but `event_date` older than 24h into the TODAY bucket instead of LIVE NOW.

#### Part 2 — Stale badge in `EventSection.tsx`

Pass the stale-live signal through to `EventSection` and display a subtle badge.

1. Add an optional `isStaleLive?: boolean` prop to `EventSection`.
2. In the header badges area, when `isStaleLive` is true:
   - Hide the normal "LIVE" or "OPEN" pulse badge
   - Show a subtle amber badge: "⏳ Awaiting Result"
3. Keep all other header behavior (countdown, collapse, pool) unchanged.

In `FightPredictions.tsx`, compute `isStaleLive` per event entry and pass it to `EventSection` in `renderEventList`. For today entries that were demoted from live, tag them.

#### Part 3 — Terminology audit result

No changes needed. The existing `sportLabels.ts` correctly maps FUTBOL → Match/Matches, and all user-facing label points already use it. Combat sports correctly show Fight/Fights.

---

### Files changed

| File | Change |
|------|--------|
| `src/pages/FightPredictions.tsx` | Add 24h stale-live guard in categorization useMemo; pass `isStaleLive` prop |
| `src/components/predictions/EventSection.tsx` | Accept `isStaleLive` prop; render "⏳ Awaiting Result" badge instead of LIVE pulse |

### Safety

- UI-only — no database mutations
- No Solana/wallet/settlement changes
- Combat sports unaffected
- Mobile layout unchanged
- Stale events remain visible (just demoted from LIVE NOW to TODAY)

