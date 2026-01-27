
# Fix Private Room Creation: Upsert Session & Share Button

## Problem Summary

When creating a private room, the `game-session-set-settings` edge function fails with `session_not_found` (404) because the `game_sessions` row doesn't exist yet. This causes:
1. Private rooms appearing in the public room list (mode never saved)
2. Mode badge showing "Casual" instead of "Private"
3. No share dialog opening for the creator

## Root Cause

The edge function at line 200-202 returns 404 when no session exists:
```typescript
if (!session) {
  return json(404, { ok: false, error: "session_not_found" });
}
```

But the session is created later during gameplay via `upsert_game_session` - by then it's too late.

---

## Technical Solution

### 1. Edge Function: Upsert Logic (CREATE if not exists)

**File:** `supabase/functions/game-session-set-settings/index.ts`

Replace the 404 return (lines 200-202) with INSERT logic:

```typescript
if (!session) {
  // Session doesn't exist yet - CREATE it with the settings
  console.log("[game-session-set-settings] No session found, creating new one");
  
  const gameTypeFromPayload = payload?.gameType || null;
  
  const { error: insertErr } = await supabase
    .from("game_sessions")
    .insert({
      room_pda: roomPda,
      player1_wallet: creatorWallet,
      player2_wallet: null,
      game_type: gameTypeFromPayload || "unknown",
      game_state: {},
      status: "waiting",
      mode: mode,
      turn_time_seconds: turnTimeSeconds,
      max_players: maxPlayers,
      p1_ready: false,
      p2_ready: false,
    });

  if (insertErr) {
    // Check if conflict (room created by another process)
    if (insertErr.code === "23505") {
      // Unique constraint violation - session was created concurrently
      // Fall through to UPDATE logic
      console.log("[game-session-set-settings] Conflict detected, falling back to update");
    } else {
      console.error("[game-session-set-settings] insert error", insertErr);
      return json(500, { ok: false, error: "insert_failed" });
    }
  } else {
    console.log("[game-session-set-settings] ✅ Session created:", { 
      roomPda: roomPda.slice(0, 8), 
      mode, 
      turnTimeSeconds, 
      maxPlayers 
    });
    return json(200, { ok: true });
  }
  
  // If we got here due to conflict, re-fetch and continue to UPDATE
  const { data: conflictSession } = await supabase
    .from("game_sessions")
    .select("room_pda, status, start_roll_finalized, player1_wallet")
    .eq("room_pda", roomPda)
    .maybeSingle();
    
  if (!conflictSession) {
    return json(500, { ok: false, error: "session_race_condition" });
  }
  
  // Use the fetched session for subsequent validation
  session = conflictSession;
}
```

Also add `gameType` extraction from payload at line ~121:
```typescript
const gameTypeFromPayload = payload?.gameType; // "Chess", "Dominos", etc.
```

### 2. CreateRoom.tsx: Pass gameType to Edge Function

**File:** `src/pages/CreateRoom.tsx`

Add a `GAME_TYPE_NAMES` mapping and include `gameType` in the edge function body.

Near the top, add:
```typescript
const GAME_TYPE_NAMES: Record<number, string> = {
  1: "Chess",
  2: "Dominos", 
  3: "Backgammon",
  4: "Checkers",
  5: "Ludo",
};
```

In the edge function call body (around line 354-363), add `gameType`:
```typescript
body: {
  roomPda: roomPdaStr,
  turnTimeSeconds: authoritativeTurnTime,
  mode: gameMode,
  maxPlayers: effectiveMaxPlayers,
  gameType: GAME_TYPE_NAMES[parseInt(gameType)] || "unknown", // ADD THIS
  creatorWallet: address,
  timestamp,
  signature,
  message,
},
```

### 3. Room.tsx: Add Visible Share Button for Private Rooms

**File:** `src/pages/Room.tsx`

Add a "Share Invite Link" button visible to the creator when the room is private and still open. This goes in the action buttons section (around line 1095-1179).

After the "Waiting for opponent to join..." message (line 1158), add:
```tsx
{/* Share button for private rooms - visible to creator */}
{isOpenStatus(status) && isCreator && roomMode === 'private' && roomModeLoaded && (
  <Button
    onClick={() => setShowShareDialog(true)}
    size="lg"
    variant="outline"
    className="gap-2 border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
  >
    <Share2 className="h-4 w-4" />
    Share Invite Link
  </Button>
)}
```

Also update the ShareInviteDialog props to include all the rich metadata (around line 1280-1290):
```tsx
<ShareInviteDialog
  open={showShareDialog}
  onOpenChange={setShowShareDialog}
  roomId={roomPdaParam || ""}
  gameName={gameName}
  stakeSol={Number(stakeLamports) / 1e9}
  winnerPayout={Number(winnerGetsFullLamports) / 1e9}
  turnTimeSeconds={turnTimeSeconds}
  maxPlayers={maxPlayers}
  playerCount={playerCount}
  mode={roomMode}
/>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/game-session-set-settings/index.ts` | Add upsert logic: INSERT if session not found, fallback to UPDATE on conflict |
| `src/pages/CreateRoom.tsx` | Add `GAME_TYPE_NAMES` map; pass `gameType` in edge function body |
| `src/pages/Room.tsx` | Add visible "Share Invite Link" button for private room creators; pass rich metadata to ShareInviteDialog |

---

## Expected Results

After implementation:
1. **Private rooms saved immediately** - Session created with `mode='private'` before navigation
2. **Private rooms stay hidden** - Filtering works because mode exists in DB
3. **Share dialog opens** - Both auto-open AND manual button available
4. **Rich share info** - Recipients see game type, stake, winnings, turn time, players, creator

---

## Deployment Notes

After implementing, the edge function will need to be deployed. The Share button and CreateRoom changes are frontend-only.
