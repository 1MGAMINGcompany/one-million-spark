

# Live Activity Indicator

## Overview
Add a real-time "browsing now" and "rooms waiting" indicator to the Home, Quick Match, and Room List pages. This creates social proof and reduces the "empty platform" feeling for new visitors.

## What You'll See

A small, elegant line of text with a pulsing gold dot:

**Mobile:** Centered below the main CTA buttons
**Desktop:** Below the hero CTA section

Format: `[pulsing dot] 12 browsing now . 2 rooms waiting`

When nobody is online: `Be the first to start a match.`

---

## How It Works

### Presence Tracking (Browsing Count)
- A new `presence_heartbeats` database table stores anonymous heartbeats (a random session ID + timestamp, no wallet required).
- On page load and every 30 seconds, the browser sends a heartbeat via a lightweight backend function.
- "Browsing now" = count of unique sessions with a heartbeat in the last 2 minutes.

### Rooms Waiting Count
- Queries `game_sessions` where `status_int = 1` (waiting) and `created_at > now() - 15 minutes`.
- This uses the same staleness window already established in the room discovery system.

### Polling
- The component polls the counts every 15 seconds.
- Numbers fade smoothly when they change (CSS transition only).

---

## Technical Details

### 1. Database Table: `presence_heartbeats`

```sql
CREATE TABLE presence_heartbeats (
  session_id TEXT PRIMARY KEY,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast count queries
CREATE INDEX idx_presence_last_seen ON presence_heartbeats(last_seen);

-- No RLS needed - edge function handles all access
ALTER TABLE presence_heartbeats ENABLE ROW LEVEL SECURITY;
-- Deny all client access (edge function uses service role)
CREATE POLICY deny_all_clients ON presence_heartbeats FOR ALL USING (false) WITH CHECK (false);
```

### 2. Edge Function: `live-stats`

Handles two actions:
- **heartbeat**: Upserts session_id with current timestamp
- **stats**: Returns `{ browsing: number, roomsWaiting: number }`

The stats query:
- Browsing: `SELECT COUNT(*) FROM presence_heartbeats WHERE last_seen > now() - interval '2 minutes'`
- Rooms waiting: `SELECT COUNT(*) FROM game_sessions WHERE status_int = 1 AND created_at > now() - interval '15 minutes'`

Cleanup: Deletes heartbeats older than 5 minutes on each stats call (lightweight garbage collection).

### 3. React Hook: `useLiveStats`

- Generates a random session ID (stored in sessionStorage so it persists across page navigations but not browser restarts).
- Sends heartbeat on mount + every 30 seconds.
- Fetches stats on mount + every 15 seconds.
- Returns `{ browsing: number, roomsWaiting: number, loading: boolean }`.

### 4. React Component: `LiveActivityIndicator`

- Renders the pulsing dot + counts.
- Uses existing CSS pulse animation pattern (similar to `sol-waiting-dot` already in the codebase).
- Muted gold color (`text-muted-foreground` with gold tint).
- Shows fallback text when both counts are 0.
- Smooth opacity transition on number changes.

### 5. Page Integration

- **Home.tsx**: Add `<LiveActivityIndicator />` below the trust indicators section (after Shield/Zap/Trophy row).
- **QuickMatch.tsx**: Add below the game/stake selector area during the "selecting" phase only.
- **RoomList.tsx**: Add below the page header, above the room cards.

No changes to game logic, matchmaking, RPC, or any existing hooks.

