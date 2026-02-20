
# Track AI Game Usage Without Wallet Login

## The Problem

The `presence_heartbeats` table currently stores only two columns: `session_id` (a random UUID from `sessionStorage`) and `last_seen`. Every page — home, rooms, AND AI games — sends the same anonymous heartbeat every 30 seconds.

This means right now there is **zero way to tell** whether a heartbeat came from someone playing Chess AI vs browsing the room list. You cannot answer "how many people are playing Ludo AI right now" or "how many AI games were played today."

---

## What We Will Build

A lightweight, **zero-friction AI game session tracker** that:

1. Adds a `page` and `game` column to `presence_heartbeats` so we know _where_ each active user is
2. Creates a new `ai_game_events` table to record discrete events: `game_started`, `game_won`, `game_lost`, `game_abandoned`
3. Updates the `live-stats` edge function to expose AI-specific stats
4. Adds a new `useAIGameTracker` hook used by all 5 AI game pages
5. Adds a read-only **AI Analytics section** to the admin stats (accessible via the live stats endpoint)

All of this is anonymous — no wallet, no login, no PII. Just a `session_id` from `sessionStorage`.

---

## Technical Details

### 1. Database Migration

**Alter `presence_heartbeats`** — add two nullable columns:
```sql
ALTER TABLE presence_heartbeats
  ADD COLUMN IF NOT EXISTS page TEXT,        -- e.g. 'home', 'play-ai', 'ai-chess', 'room-list'
  ADD COLUMN IF NOT EXISTS game TEXT;        -- e.g. 'chess', 'ludo', null (non-AI pages)
```

**Create `ai_game_events` table**:
```sql
CREATE TABLE IF NOT EXISTS ai_game_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT NOT NULL,
  game        TEXT NOT NULL,          -- 'chess' | 'checkers' | 'backgammon' | 'dominos' | 'ludo'
  difficulty  TEXT NOT NULL,          -- 'easy' | 'medium' | 'hard'
  event       TEXT NOT NULL,          -- 'game_started' | 'game_won' | 'game_lost' | 'game_abandoned'
  duration_seconds INTEGER,           -- null for 'game_started', populated on end events
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: allow anonymous inserts (same as client_errors pattern), no client reads
ALTER TABLE ai_game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_ai_events" ON ai_game_events FOR INSERT WITH CHECK (true);
CREATE POLICY "no_client_reads_ai_events" ON ai_game_events FOR SELECT USING (false);
```

This mirrors the existing `client_errors` table security pattern — write-only from the browser, read only by edge functions using the service role key.

### 2. Update `live-stats` Edge Function

Extend the `action === "heartbeat"` handler to accept and store `page` and `game`:
```typescript
const { action, sessionId, page, game } = await req.json();

// heartbeat: upsert with page/game
await supabase.from("presence_heartbeats").upsert({
  session_id: sessionId,
  last_seen: new Date().toISOString(),
  page: page ?? null,
  game: game ?? null,
}, { onConflict: "session_id" });
```

Add a new `action === "track_ai_event"` handler:
```typescript
// Insert into ai_game_events directly (service role bypasses RLS)
await supabase.from("ai_game_events").insert({
  session_id, game, difficulty, event, duration_seconds
});
```

Extend the `action === "stats"` handler to return AI-specific counts:
```typescript
// Count active AI players (heartbeats in last 2 min with game != null)
const { count: playingAI } = await supabase
  .from("presence_heartbeats")
  .select("*", { count: "exact", head: true })
  .not("game", "is", null)
  .gte("last_seen", twoMinAgo);

// Today's AI games started
const todayStart = new Date(); todayStart.setHours(0,0,0,0);
const { count: aiGamesToday } = await supabase
  .from("ai_game_events")
  .select("*", { count: "exact", head: true })
  .eq("event", "game_started")
  .gte("created_at", todayStart.toISOString());

// Return alongside existing browsing/roomsWaiting
return { browsing, roomsWaiting, playingAI, aiGamesToday, byGame }
```

### 3. New `useAIGameTracker` Hook

New file: `src/hooks/useAIGameTracker.ts`

```typescript
// Tracks presence AND discrete events for an AI game session
export function useAIGameTracker(game: string, difficulty: string) {
  // On mount: send heartbeat with page/game + fire 'game_started' event
  // On unmount (page leave): fire 'game_abandoned' if no outcome recorded yet
  // Exposes: recordWin(), recordLoss() — call from onGameOver callback
}
```

The hook internally:
- Records game start time in a `useRef`
- Sends `game_started` event on mount via `live-stats`
- Sends `game_won` / `game_lost` + `duration_seconds` when called
- Sends `game_abandoned` + `duration_seconds` on unmount (via `useEffect` cleanup) **only** if `recordWin/recordLoss` was not already called
- Sends heartbeats every 30s with `page: 'ai-{game}'` and `game: game`

### 4. Update All 5 AI Game Pages

Each page calls `useAIGameTracker` instead of (or in addition to) `usePresenceHeartbeat`, and calls `recordWin()` / `recordLoss()` in its `onGameOver` callback:

| File | Change |
|---|---|
| `src/pages/ChessAI.tsx` | Replace `usePresenceHeartbeat()` → `useAIGameTracker('chess', difficulty)` |
| `src/pages/CheckersAI.tsx` | Same for `'checkers'` |
| `src/pages/BackgammonAI.tsx` | Same for `'backgammon'` |
| `src/pages/DominosAI.tsx` | Same for `'dominos'` |
| `src/pages/LudoAI.tsx` | Same for `'ludo'` |
| `src/pages/PlayAILobby.tsx` | Update heartbeat to send `page: 'play-ai-lobby'` |

### 5. Update `usePresenceHeartbeat` to Accept a Page

Update the hook signature to optionally accept `page` and `game`:
```typescript
export function usePresenceHeartbeat(page?: string, game?: string)
```
All existing callers (Home, Navbar, etc.) pass nothing — behaviour unchanged. AI pages use `useAIGameTracker` which wraps this internally.

---

## What You'll Be Able to See (Immediately)

Via the backend, querying `ai_game_events`:
- **Games started per game type today/this week**
- **Win rate per game type** (how often humans beat the AI)
- **Average game duration** per game type and difficulty
- **Drop rate** — how many sessions start but get abandoned vs completed
- **Difficulty preference** — which difficulty users choose most

Via `presence_heartbeats` with the new `game` column:
- **Real-time active AI players** (who is in a game right now)
- **Which specific game** is being played at this moment

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/...sql` | Add `page`/`game` columns to `presence_heartbeats`, create `ai_game_events` table + RLS |
| `supabase/functions/live-stats/index.ts` | Accept `page`/`game` in heartbeat; add `track_ai_event` action; extend stats output |
| `src/hooks/usePresenceHeartbeat.ts` | Accept optional `page` + `game` params and forward them |
| `src/hooks/useAIGameTracker.ts` | New hook — wraps heartbeat + event tracking |
| `src/pages/ChessAI.tsx` | Use `useAIGameTracker`, call `recordWin/recordLoss` in `onGameOver` |
| `src/pages/CheckersAI.tsx` | Same |
| `src/pages/BackgammonAI.tsx` | Same |
| `src/pages/DominosAI.tsx` | Same |
| `src/pages/LudoAI.tsx` | Same |
| `src/pages/PlayAILobby.tsx` | Pass `page: 'play-ai-lobby'` to heartbeat |

No auth changes, no Solana/wallet changes, no game logic changes. All data is anonymous and GDPR-safe (no PII stored).
