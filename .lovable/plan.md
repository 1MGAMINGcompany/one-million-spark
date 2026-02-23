

# Fix: Notify Opponent When Player Exits Ludo Multiplayer

## Problem

When a player exits a Ludo multiplayer game (via the leave button, back navigation, or closing the browser), the other player is never notified. They sit there waiting for a turn that will never come.

Three exit paths are broken:
1. **handleUILeave** (line 492): Just calls `navigate()` -- sends NO WebRTC message and NO DB update
2. **handleConfirmForfeit** (line 448): Sends `sendPlayerEliminated` via WebRTC, but WebRTC is unreliable on mobile -- if the connection dropped, the message is lost. The `forfeitGame` backend call updates on-chain state but does NOT update `game_sessions` status.
3. **Browser close / tab switch**: No `beforeunload` or `visibilitychange` handler -- no cleanup happens at all

## Fix Plan

### 1. Update `handleUILeave` to broadcast resignation before navigating

**File: `src/pages/LudoGame.tsx`**

Before navigating away in `handleUILeave`, send a WebRTC `resign` message AND update the DB game session via `finish_game_session` RPC so the opponent's realtime subscription picks it up even if WebRTC fails.

```
const handleUILeave = useCallback(async () => {
  // Broadcast via WebRTC (best-effort)
  sendPlayerEliminatedRef.current?.(myPlayerIndex);
  
  // Update DB so opponent's realtime subscription detects it
  if (roomPda) {
    await supabase.rpc("finish_game_session", {
      p_room_pda: roomPda,
      p_caller_wallet: effectivePlayerId,
      p_winner_wallet: null, // no winner on leave
    }).catch(() => {});
  }
  
  navigate("/room-list");
  toast({ ... });
}, [...]);
```

### 2. Add `beforeunload` and `visibilitychange` handlers

**File: `src/pages/LudoGame.tsx`**

Add a `useEffect` that listens for tab close / browser close events and sends a beacon to the DB to mark the session as abandoned. Use `navigator.sendBeacon` for reliability on page unload.

### 3. Add opponent disconnect detection via game_sessions realtime

**File: `src/pages/LudoGame.tsx`**

Subscribe to `game_sessions` changes for the current room. When `status_int` changes to 3 (finished) or 5 (cancelled) while the game is still in progress locally, show a toast: "Your opponent left the game" and end the game.

This uses the existing `useRoomRealtimeAlert` pattern but watches for game-over transitions instead of waiting-to-active.

### 4. Update `handleConfirmForfeit` to also update DB

**File: `src/pages/LudoGame.tsx`**

After the `forfeitGame` on-chain call, also call `finish_game_session` RPC to set the DB status. Currently `forfeitGame` only handles on-chain state, leaving the DB row in "active" state. The opponent's realtime subscription never fires.

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/LudoGame.tsx` | Fix handleUILeave to broadcast + update DB. Add beforeunload/visibilitychange handler. Add realtime subscription for opponent disconnect. Fix handleConfirmForfeit to update DB. |

## What Does NOT Change

- WebRTC infrastructure
- On-chain forfeit/cancel logic  
- Other game pages (Chess, Backgammon, etc. have the same issue but are out of scope for this fix -- can be done as follow-up)
- Edge functions
- Database schema (uses existing `finish_game_session` RPC)

