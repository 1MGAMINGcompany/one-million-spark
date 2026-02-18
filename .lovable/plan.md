

# Fix: Let Players Play AI While Waiting for Opponents

## Problem
The "play AI while waiting" flow already works mechanically -- GlobalActiveRoomBanner (in App.tsx) shows on AI pages and auto-redirects when an opponent joins. However, the `maybe_apply_waiting_timeout` database function cancels rooms after **120 seconds**, so the room disappears from discovery before anyone can realistically find it. This is the same issue identified in the previous conversation.

## What Similar Apps Do
- **Chess.com / Lichess**: Queue stays active for 5-15+ minutes. Players can do puzzles, play bots, or browse freely. A persistent banner or popup fires when a match is found.
- **Backgammon Galaxy**: Persistent background queue with notification bar, no short timeout.

The common pattern: long-lived queue + background notification. 1M Gaming already has the notification/redirect part; it just needs the timeout fix.

## Single Change Required

### Database Migration: Increase waiting timeout from 120s to 900s (15 minutes)

Update the `maybe_apply_waiting_timeout` function to change one variable:

```sql
-- Before
v_waiting_timeout_seconds INTEGER := 120;

-- After  
v_waiting_timeout_seconds INTEGER := 900;
```

This aligns with:
- The client-side `ROOM_MAX_AGE_MS` (15 minutes) used by room list filtering
- The `cleanup-stale-rooms` cron job (also 15 minutes)

### What Already Works (No Changes Needed)
- **GlobalActiveRoomBanner**: Mounted globally in App.tsx, visible on AI game pages, shows "Waiting for opponent" with game info
- **Auto-redirect**: When opponent joins (detected via polling + realtime subscription), plays a sound, shows a notification, and navigates to `/play/:pda`
- **Browser notification**: Fires even if the tab is backgrounded
- **Heartbeat tracking**: AI pages already send presence heartbeats (implemented in previous task)

### Risk Assessment
- **Low risk**: Only affects how long a solo waiting room stays discoverable
- Players can still manually cancel anytime
- On-chain room already stays open until explicitly cancelled
- No game logic, settlement, or fund flow changes

