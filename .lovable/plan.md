

# Count AI Players in "Browsing Now" (Heartbeat Only)

## Overview
Extract the heartbeat logic from `useLiveStats` into a standalone `usePresenceHeartbeat` hook, then add it to all AI game pages. The indicator widget stays only on Home, Quick Match, and Room List -- no UI changes on AI pages.

## Changes

### 1. New hook: `src/hooks/usePresenceHeartbeat.ts`
A lightweight hook that only sends heartbeats (no stats fetching, no state). It reuses the same `getSessionId()` pattern and calls the existing `live-stats` edge function with `action: "heartbeat"`.

- On mount: sends heartbeat immediately
- Every 30 seconds: sends heartbeat
- On unmount: clears interval
- No UI return value, no state

### 2. Refactor `useLiveStats` to use `usePresenceHeartbeat`
Remove the duplicate heartbeat logic from `useLiveStats` and have it call `usePresenceHeartbeat()` internally. This keeps the stats-fetching behavior unchanged while sharing the same session ID and heartbeat mechanism.

### 3. Add `usePresenceHeartbeat()` to AI pages
Import and call the hook in these 6 pages (one line each, no UI rendered):

- `src/pages/PlayAILobby.tsx` -- the /play-ai lobby
- `src/pages/ChessAI.tsx`
- `src/pages/DominosAI.tsx`
- `src/pages/BackgammonAI.tsx`
- `src/pages/CheckersAI.tsx`
- `src/pages/LudoAI.tsx`

### What does NOT change
- No game logic, timers, matchmaking, Solana, or RPC changes
- No edge function changes (same `live-stats` endpoint)
- No database changes
- LiveActivityIndicator stays only on Home, Quick Match, Room List
- No new dependencies

## Technical Detail

```text
usePresenceHeartbeat()          -- new, heartbeat-only hook
  |
  +-- used by useLiveStats()   -- existing, adds stats polling
  +-- used by AI pages         -- new, silent heartbeat only
```

The shared `getSessionId()` function ensures the same session ID is used regardless of which hook runs first, so navigating from Home to an AI page won't create a duplicate presence entry.

