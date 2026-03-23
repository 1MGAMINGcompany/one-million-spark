

## Fix: Only Show Future Events (Tomorrow+) & Block Futures Markets

### Problem
Two issues persist:
1. **Past/today events still appear** — `isDateEligible` uses `Math.max()` across ALL dates including child market `endDate` values. Futures markets have far-future market expiry dates (Dec 2026+), so past events with long-tail sub-markets pass the filter.
2. **Futures/prop markets pass** — Events like "Who will X fight next?" or "FIFA World Cup Winner" have binary markets, so `isAcceptableEvent` accepts them via the `binary_market_detected` fallback.

### Changes

**File: `supabase/functions/polymarket-sync/index.ts`**

#### 1. Rewrite `isDateEligible` (lines 105–131)
- Only use **event-level** dates (`ev.endDate`, `ev.startDate`) — ignore child market `endDate` (those are market expiry, not match time).
- Compute "tomorrow midnight UTC" as the cutoff instead of `Date.now()`.
- If no event-level date exists → **reject** (hide undated, per user preference).
- If best event-level date is before tomorrow → **reject**.

```typescript
function isDateEligible(ev: GammaEvent) {
  // Tomorrow 00:00 UTC
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const cutoff = tomorrow.getTime();

  const eventDates = [ev.endDate, ev.startDate]
    .map(d => d ? new Date(d).getTime() : null)
    .filter((ms): ms is number => ms !== null && !isNaN(ms));

  if (eventDates.length === 0)
    return { eligible: false, reason: "no_event_date", missingDate: true };

  const best = Math.max(...eventDates);
  if (best >= cutoff)
    return { eligible: true, reason: "future_event", missingDate: false };

  return { eligible: false, reason: `past_or_today: ${new Date(best).toISOString()}`, missingDate: false };
}
```

#### 2. Add futures title rejection in `isAcceptableEvent` (before binary market fallback, ~line 90)
Add a regex check to reject common futures/outright/prop patterns:

```typescript
const FUTURES_RE = /\b(who will .* (fight|face) next|winner$|top scorer|mvp|most valuable|champion at|will .* win the)\b/i;
if (FUTURES_RE.test(title)) return { accepted: false, reason: `futures_market: "${title}"` };
```

This goes right before the binary market fallback (line 90), so real fixtures with "vs" patterns still pass at line 76.

#### 3. Lower futures badge threshold in admin UI

**File: `src/pages/FightPredictionAdmin.tsx`**
- Change the futures warning badge from `≥ 20` markets to `≥ 10` markets.

### Impact
- Only events dated **tomorrow or later** appear in browse/search results.
- Today's and yesterday's matches are filtered out.
- Futures/prop markets ("Who will X fight next?", "World Cup Winner") are rejected by title pattern before the binary fallback can accept them.
- Undated events are hidden entirely.
- Real match fixtures with "vs"/"v"/"at" patterns and future dates continue to pass normally.

