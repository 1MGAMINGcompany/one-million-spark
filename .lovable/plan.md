
## Plan: Add Turn Time Display + Fix Timeout Turn Passing

This plan addresses two issues:
1. **Display turn time** in Room List page 
2. **Fix timeout turn passing** - when timer expires, the opponent doesn't receive the turn properly

---

## Issue 1: Turn Time Display in Room List

### Root Cause
The Room List page shows game type, stake, and player count, but NOT the turn time. The `RoomDisplay` interface already has `turnTimeSec` (line 99 of `src/lib/solana-program.ts`), but it's not being displayed.

### Changes Required

**File: `src/pages/RoomList.tsx`**

Add turn time display in two places:

### Change 1: Room card info line (around line 456-465)

Currently shows: stake, players, creator address

**After the players span (line 456-459), add turn time display:**
```tsx
<span className="flex items-center gap-1">
  <Users className="h-3.5 w-3.5" />
  {room.playerCount}/{room.maxPlayers}
</span>
{/* ADD: Turn time display */}
{room.turnTimeSec > 0 && (
  <span className="flex items-center gap-1">
    <Clock className="h-3.5 w-3.5 text-amber-400" />
    {room.turnTimeSec}s
  </span>
)}
<span className="hidden sm:flex items-center gap-1 truncate">
  ...
</span>
```

**Note:** The Clock icon is already imported (line 16).

---

## Issue 2: Turn Timer Expiration Not Passing Turn to Opponent

### Root Cause Analysis

From the logs and database:
1. Desktop user's timer expired at 00:00:09
2. The `turn_timeout` was successfully submitted to DB (turn 21)
3. DB correctly updated `current_turn_wallet` to mobile user
4. Game session shows `status: finished` (likely a subsequent auto_forfeit due to 3 missed turns)

The issue is that the **mobile client didn't receive the turn update** in time. Looking at the code:

**The polling fallback (lines 803-815) updates `currentTurnWallet` but:**
- Polls every 5 seconds (too slow for responsive UX)
- Only updates the wallet state, doesn't trigger dice reset or status update
- Doesn't process the `turn_timeout` move to show toast notification

**The Realtime subscription (`useDurableGameSync` lines 265-290) should work but:**
- Wallet browsers often have connectivity issues
- If the subscription drops, moves are missed

### Solution

Strengthen the polling fallback and add explicit turn change handling:

### Change 1: Improve polling to process turn_timeout moves

**File: `src/pages/BackgammonGame.tsx`** (lines 745-828)

Update the polling fallback to also fetch and process new moves when a turn change is detected:

```tsx
// Polling fallback for currentTurnWallet sync (in case WebRTC fails)
useEffect(() => {
  if (!roomPda || !isRankedGame || !startRoll.isFinalized) return;

  const pollTurnWallet = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      if (error) {
        console.warn("[BackgammonGame] Poll error:", error);
        return;
      }

      // Detect finished game
      const dbStatus = data?.session?.status;
      let dbWinner = data?.session?.winner_wallet;
      if (dbStatus === 'finished' && !gameOver) {
        // ... existing finish detection code ...
        return;
      }

      if (gameOver) return;

      const dbTurnWallet = data?.session?.current_turn_wallet;
      const dbTurnStartedAt = data?.session?.turn_started_at;
      
      // IMPROVEMENT: When turn changes, also fetch latest move to see if it was a timeout
      if (dbTurnWallet && dbTurnWallet !== currentTurnWallet) {
        console.log("[BackgammonGame] Polling detected turn change:", {
          from: currentTurnWallet?.slice(0, 8),
          to: dbTurnWallet.slice(0, 8),
        });
        
        // Check if turn changed TO ME - need to update game state
        const isNowMyTurn = isSameWallet(dbTurnWallet, address);
        
        if (isNowMyTurn) {
          // Fetch latest move to see why turn changed
          const { data: movesData } = await supabase.functions.invoke("get-moves", {
            body: { roomPda, limit: 1, orderDesc: true },
          });
          const lastMove = movesData?.moves?.[0];
          const lastMoveType = lastMove?.move_data?.type;
          
          console.log("[BackgammonGame] Turn passed to me via polling:", {
            lastMoveType,
            lastMoveWallet: lastMove?.wallet?.slice(0, 8),
          });
          
          // If opponent timed out, show notification
          if (lastMoveType === 'turn_timeout') {
            toast({
              title: t('gameSession.opponentSkipped'),
              description: t('gameSession.yourTurnNow'),
            });
          }
        }
        
        setCurrentTurnWallet(dbTurnWallet);
        // Reset dice and remaining moves for clean turn start
        setDice([]);
        setRemainingMoves([]);
        setSelectedPoint(null);
        setValidMoves([]);
        
        // Update game status
        if (isNowMyTurn) {
          setGameStatus("Your turn - Roll the dice!");
        } else {
          setGameStatus("Opponent's turn");
        }
      }
      
      if (dbTurnStartedAt && dbTurnStartedAt !== turnStartedAt) {
        setTurnStartedAt(dbTurnStartedAt);
        // Reset timeout debounce when turn_started_at changes
        timeoutFiredRef.current = false;
      }
    } catch (err) {
      console.error("[BackgammonGame] Polling error:", err);
    }
  };

  const interval = setInterval(pollTurnWallet, 5000);
  return () => clearInterval(interval);
}, [roomPda, isRankedGame, gameOver, startRoll.isFinalized, currentTurnWallet, turnStartedAt, address, myRole, play, t]);
```

### Change 2: Add visibility change handler for faster sync

When the user switches back to the game tab, immediately poll for updates:

**File: `src/pages/BackgammonGame.tsx`** (after the polling effect, around line 830)

```tsx
// Visibility change handler - poll immediately when tab becomes visible
useEffect(() => {
  if (!roomPda || !isRankedGame || gameOver) return;
  
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log("[BackgammonGame] Tab became visible - polling for updates");
      // Force immediate sync
      supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      }).then(({ data }) => {
        const dbTurnWallet = data?.session?.current_turn_wallet;
        if (dbTurnWallet && dbTurnWallet !== currentTurnWallet) {
          console.log("[BackgammonGame] Visibility poll detected turn change");
          setCurrentTurnWallet(dbTurnWallet);
          setDice([]);
          setRemainingMoves([]);
          const isNowMyTurn = isSameWallet(dbTurnWallet, address);
          setGameStatus(isNowMyTurn ? "Your turn - Roll the dice!" : "Opponent's turn");
        }
      });
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [roomPda, isRankedGame, gameOver, currentTurnWallet, address]);
```

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/pages/RoomList.tsx` | Add turn time display after players count | Show turn time (e.g., "15s") in room cards |
| `src/pages/BackgammonGame.tsx` | Improve polling to process turn_timeout | Show toast when opponent times out |
| `src/pages/BackgammonGame.tsx` | Add visibility change handler | Faster sync when switching tabs/devices |

## Technical Notes

- The `RoomDisplay.turnTimeSec` field is already populated from on-chain data
- The polling fallback runs every 5 seconds - adding visibility handler provides instant sync
- The toast notification for opponent timeout uses existing i18n keys

## Expected Result

1. Room List shows turn time (e.g., "⏱ 15s") next to player count
2. When opponent's timer expires:
   - Mobile user receives turn within 5 seconds (polling) OR instantly (Realtime)
   - Toast notification: "Opponent skipped - Your turn now!"
   - Game status updates to "Your turn - Roll the dice!"
3. Tab switching triggers immediate sync
