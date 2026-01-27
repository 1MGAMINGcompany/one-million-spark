
## Fix Plan: Forfeit Notification and Turn Time Display

### Problem Summary

Two issues were identified from testing:

1. **Forfeit doesn't notify opponent**: When a player forfeits (manually or via auto-forfeit), the opponent's screen stays on the game board instead of showing "YOU WIN"
2. **Turn time not visible in Room List**: The configured turn time (e.g., "10s turn") is not displayed in the room list before joining

---

## Root Cause Analysis

### Issue 1: Forfeit Notification Bug

**Current behavior:**
- Player A clicks "Forfeit" → Edge function settles on-chain → Player A navigates away in 1 second
- Player B sees nothing because no WebRTC/Realtime message was sent

**Missing step:**
The `handleTurnTimeout` function (3-strike auto-forfeit) and manual forfeit both call `forfeit()` but **never call `sendResign()`** to notify the opponent via WebRTC.

Compare to manual resign which works correctly:
```typescript
// handleResign - WORKS because it sends WebRTC first
sendResign();           // ← Notifies opponent
await forfeit();        // ← Settles on-chain
```

```typescript
// handleTurnTimeout - BROKEN because it skips WebRTC
forfeitFnRef.current?.();  // ← Settles on-chain (navigates away)
// MISSING: sendResign() or any opponent notification
```

### Issue 2: Turn Time Display Bug

**Current behavior:**
- Turn time is only shown for rooms that have an active session in `game_sessions` table
- New rooms (before any player joins and game starts) don't have a session yet
- Waiting rooms show "1/2" but no turn time

**The real issue:**
For ranked games, the turn time should be displayed from the **on-chain room data** or a **configuration source**, not from the game session (which only exists after the game starts).

However, looking at the database, the rooms in question have `turn_time_seconds: 60` but the user created a room with 10s turn time. This means:
- The `turn_time_seconds` is only set when the game session is created at game start
- Before that, there's no turn time data available
- Additionally, the room list fetches from `game_sessions` but filters by `status: 'active'`, which excludes waiting rooms

---

## Technical Solution

### Part 1: Fix Forfeit/Auto-Forfeit Opponent Notification

**Files to modify:**
- `src/pages/ChessGame.tsx`
- `src/pages/CheckersGame.tsx`  
- `src/pages/BackgammonGame.tsx`
- `src/pages/DominosGame.tsx`

**Change 1: Update `handleTurnTimeout` to send WebRTC message on 3rd strike**

In the 3-strike forfeit block, add `sendResign()` before calling the forfeit function:

```typescript
if (newMissedCount >= 3) {
  // 3 STRIKES = AUTO FORFEIT
  toast({
    title: t('gameSession.autoForfeit'),
    description: t('gameSession.missedThreeTurns'),
    variant: "destructive",
  });
  
  if (iTimedOut) {
    // I missed 3 turns -> I lose
    // CRITICAL FIX: Notify opponent BEFORE navigating away
    sendResign();  // ← ADD THIS LINE
    
    forfeitFnRef.current?.();
    setGameOver(true);
    setWinnerWallet(opponentWalletAddr);
    // ...
  }
}
```

**Change 2: Add `sendResign` to useCallback dependencies**

Ensure `sendResign` is available in the `handleTurnTimeout` callback by adding it to the dependency list and passing it through.

**Change 3: Add a database poll fallback for opponent detection**

When the game ends via forfeit/auto-forfeit, the opponent should detect this even without WebRTC. Add polling in the game components that checks `game_sessions.status` and reacts to `status: 'finished'`.

### Part 2: Fix Turn Time Display in Room List

**Approach A: Show turn time from room creation data (Preferred)**

Store turn time in the room creation flow and display it before the game starts.

**Files to modify:**
- `src/pages/RoomList.tsx`
- `src/pages/Room.tsx` (the room details page shown in screenshot 2)

**Change 1: Update Room.tsx to show turn time**

The room details page already has access to stake information. Add turn time display:

```typescript
// In Room.tsx - add turn time display for ranked games
{isRanked && (
  <div className="flex items-center gap-2 text-amber-400">
    <Timer className="h-4 w-4" />
    <span>Turn Time: {formatTurnTime(turnTimeSeconds || 60)}</span>
  </div>
)}
```

**Change 2: Store turn time on room creation**

When creating a ranked room, store the turn time setting in the game session or a separate metadata table so it's available in the room list.

**Change 3: Fetch turn time for waiting rooms**

Update `game-sessions-list` to also return data for `status: 'waiting'` rooms (not just active), so turn time is visible before the game starts.

---

## Implementation Details

### handleTurnTimeout Fix (ChessGame.tsx example)

Location: Lines 539-571

Add `sendResign` call before forfeit execution:

```typescript
if (newMissedCount >= 3) {
  // 3 STRIKES = AUTO FORFEIT
  toast({
    title: t('gameSession.autoForfeit'),
    description: t('gameSession.missedThreeTurns'),
    variant: "destructive",
  });
  
  // Persist minimal turn_timeout event
  if (isRankedGame && opponentWalletAddr) {
    persistMove({
      action: "auto_forfeit",  // Change from turn_timeout to auto_forfeit
      timedOutWallet: timedOutWallet,
      winnerWallet: iTimedOut ? opponentWalletAddr : address,
      missedCount: newMissedCount,
    } as any, address);
  }
  
  if (iTimedOut) {
    // I missed 3 turns -> I lose
    // FIX: Notify opponent via WebRTC BEFORE navigating away
    sendResign();  // ← NEW LINE
    
    forfeitFnRef.current?.();
    setGameOver(true);
    setWinnerWallet(opponentWalletAddr);
    setGameStatus(myColor === 'w' ? t('game.black') + " wins" : t('game.white') + " wins");
    play('chess_lose');
  } else {
    // Opponent missed 3 turns -> I win
    // No WebRTC needed - I detected it, I update my own UI
    setGameOver(true);
    setWinnerWallet(address);
    setGameStatus(myColor === 'w' ? t('game.white') + " wins" : t('game.black') + " wins");
    play('chess_win');
  }
}
```

### Database Polling Fallback

Add a useEffect that polls the game session status every 5 seconds:

```typescript
// Poll database for game end detection (fallback for WebRTC failures)
useEffect(() => {
  if (!roomPda || gameOver || !canPlay) return;
  
  const pollGameEnd = async () => {
    const { data } = await supabase.functions.invoke("game-session-get", {
      body: { roomPda },
    });
    
    if (data?.session?.status === 'finished' && !gameOver) {
      // Game ended - determine winner from last move
      const lastMove = data.lastMove;
      if (lastMove?.move_data?.winnerWallet) {
        const isWinner = isSameWallet(lastMove.move_data.winnerWallet, address);
        setWinnerWallet(lastMove.move_data.winnerWallet);
        setGameOver(true);
        setGameStatus(isWinner ? "You Win!" : "You Lose");
        play(isWinner ? 'chess_win' : 'chess_lose');
      }
    }
  };
  
  const interval = setInterval(pollGameEnd, 5000);
  return () => clearInterval(interval);
}, [roomPda, gameOver, canPlay, address]);
```

### Room List Turn Time Fix

**Option 1: Show for all ranked rooms**

Update the room list to display the default ranked turn time (from CreateRoom settings) even before game starts:

```typescript
// In RoomList.tsx - show turn time for ALL ranked rooms
{(() => {
  const isRanked = room.entryFeeSol > 0;
  if (isRanked) {
    // Try to get from session first, otherwise show default
    const session = activeSessionsMap.get(room.pda);
    const turnTime = session?.turnTimeSeconds || 60; // Default for ranked
    return (
      <span className="flex items-center gap-1 text-amber-400">
        <Timer className="h-3.5 w-3.5" />
        {formatTurnTime(turnTime)} turn
      </span>
    );
  }
  return null;
})()}
```

**Option 2: Store turn time on-chain or in room metadata**

This requires modifying the room creation flow to persist turn time settings, which is a larger change.

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/pages/ChessGame.tsx` | Add `sendResign()` to auto-forfeit, add DB poll fallback |
| `src/pages/CheckersGame.tsx` | Same changes |
| `src/pages/BackgammonGame.tsx` | Same changes |
| `src/pages/DominosGame.tsx` | Same changes |
| `src/pages/RoomList.tsx` | Show turn time for all ranked rooms (default if no session) |
| `src/pages/Room.tsx` | Display turn time in room details page |

---

## Expected Results After Fix

1. When Player A forfeits (manual or auto):
   - Player A sees "You Lose" and navigates away
   - Player B immediately sees "YOU WIN" via WebRTC message
   - If WebRTC fails, Player B sees "YOU WIN" within 5 seconds via DB poll

2. Room List display:
   - All ranked rooms show turn time (e.g., "⏱️ 1m turn" or "⏱️ 10s turn")
   - Turn time visible even for waiting rooms (1/2 players)

3. Room Details page (Room.tsx):
   - Shows turn time setting for ranked games
   - Players know the game pace before joining
