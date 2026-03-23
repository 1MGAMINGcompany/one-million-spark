

## Hide Past Events from Admin Dashboard

### Problem
The admin sees stale/past events cluttering the dashboard — events whose `event_date` has passed should not appear in "Active" or other main tabs.

### Change

**File: `src/pages/FightPredictionAdmin.tsx`** (line ~386-397)

Update `getEventBucket` to route past events to "archived" automatically:
- If the event's `event_date` is more than 48 hours in the past AND all its fights are fully settled (or it has no fights), bucket it as `"archived"` instead of `"active"`.
- If the event's `event_date` is in the past but fights are still open/live, keep it in its current bucket but add a visual "⚠️ Past" badge so the admin notices.

This keeps the Active/Live/Action tabs clean while still allowing the admin to find old events under the existing "Archived" tab.

### Detail

In `getEventBucket`, after the dismissed/archived/draft checks and before fight-state checks, add:

```typescript
const eventMs = e.event_date ? new Date(e.event_date).getTime() : null;
const isPast = eventMs != null && (Date.now() - eventMs) > 48 * 60 * 60 * 1000;
if (isPast && eventIsFullySettled(e.id)) return "archived";
```

This auto-archives fully-settled past events without hiding events that still need admin action (like unsettled fights on a past-date event).

