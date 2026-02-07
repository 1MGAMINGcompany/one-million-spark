
# Fix: Turn Timer Not Passing Turn After Timeout (Chess, Checkers, Dominos)

## Problem Summary
When a player's turn timer expires, the server correctly records a `turn_timeout` event and updates `current_turn_wallet` in the database, but the **UI never updates** - the board still shows it's the same player's turn.

## Root Cause
ChessGame, CheckersGame, and DominosGame are **missing the polling fallback** that BackgammonGame has. The games call `maybe_apply_turn_timeout` when their own timer expires, but they never:
1. Poll the database to detect when the opponent's timeout was applied
2. Update local turn state (`setTurnOverrideWallet`) based on DB changes

## Evidence from Your Tests

| Game | Room | Turn Time | Timeout Recorded? | Turn Passed in UI? |
|------|------|-----------|-------------------|-------------------|
| Private Chess | AJCR5ft... | 10s | ✅ Yes | ❌ No |
| Ranked Chess | 2zxNPas... | 10s | ✅ Yes | ❌ No |

The server is working correctly - we can see `turn_timeout` moves recorded with `nextTurnWallet` set to the opponent. The problem is purely on the frontend.

## Backgammon Working Pattern (DO NOT MODIFY)

BackgammonGame.tsx has a polling effect (lines 741-923) that:
1. Polls `game-session-get` every 5 seconds
2. Checks if it's opponent's turn and calls `maybe_apply_turn_timeout`
3. Detects when `current_turn_wallet` changed in DB
4. Updates local state: `setCurrentTurnWallet(freshTurnWallet)`
5. Resets timer: `turnTimer.resetTimer()`
6. Shows toast: "Opponent skipped - 1/3 missed turns"

## Solution: Add Polling Fallback to Chess, Checkers, and Dominos

Add the same polling pattern from Backgammon to the other three games. This involves adding a new `useEffect` that:

### Polling Logic to Add (for each game)

```typescript
// Polling fallback for turn sync (in case WebRTC fails)
useEffect(() => {
  if (!roomPda || !isRankedGame || !startRoll.isFinalized || gameOver) return;

  const pollTurnWallet = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      if (error || !data?.session) return;
      
      // Check for finished game
      if (data.session.status === 'finished' && !gameOver) {
        const winner = data.session.winner_wallet;
        setWinnerWallet(winner);
        setGameOver(true);
        // Play appropriate sound
        return;
      }

      // SERVER-SIDE TIMEOUT CHECK (for opponent's turn)
      const dbTurnWallet = data.session.current_turn_wallet;
      const isOpponentsTurn = dbTurnWallet && !isSameWallet(dbTurnWallet, address);
      
      if (isOpponentsTurn) {
        // Try to apply timeout if opponent is idle
        const { data: timeoutResult } = await supabase.rpc("maybe_apply_turn_timeout", {
          p_room_pda: roomPda,
        });
        
        if (timeoutResult?.applied) {
          if (timeoutResult.type === "auto_forfeit") {
            // 3 strikes - game over
            setWinnerWallet(timeoutResult.winnerWallet);
            setGameOver(true);
            return;
          } else if (timeoutResult.type === "turn_timeout") {
            toast({
              title: t('gameSession.opponentSkipped'),
              description: `${timeoutResult.strikes}/3 ${t('gameSession.missedTurns')}`,
            });
          }
        }
      }

      // Re-fetch to get updated turn wallet after potential timeout
      const { data: freshData } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      const freshTurnWallet = freshData?.session?.current_turn_wallet;

      // Detect turn change and update local state
      if (freshTurnWallet && freshTurnWallet !== turnOverrideWallet) {
        const wasMyTurn = turnOverrideWallet && isSameWallet(turnOverrideWallet, address);
        const isNowMyTurn = isSameWallet(freshTurnWallet, address);
        
        if (isNowMyTurn !== wasMyTurn) {
          console.log("[Polling] Turn changed:", {
            from: turnOverrideWallet?.slice(0, 8),
            to: freshTurnWallet.slice(0, 8),
          });
          
          setTurnOverrideWallet(freshTurnWallet);
          turnTimer.resetTimer();
        }
      }
    } catch (err) {
      console.error("[Polling] Error:", err);
    }
  };

  const interval = setInterval(pollTurnWallet, 5000);
  return () => clearInterval(interval);
}, [roomPda, isRankedGame, startRoll.isFinalized, gameOver, turnOverrideWallet, address, t]);
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ChessGame.tsx` | Add polling fallback useEffect (~60 lines) |
| `src/pages/CheckersGame.tsx` | Add polling fallback useEffect (~60 lines) |
| `src/pages/DominosGame.tsx` | Add polling fallback useEffect (~60 lines) |

## Technical Details

### State Changes Needed

For Chess (turn is derived from `game.turn()` + `turnOverrideWallet`):
- The `turnOverrideWallet` state already exists (line 493)
- Polling just needs to update this when DB turn changes

For Checkers and Dominos:
- Same pattern - they use `turnOverrideWallet` or equivalent turn state
- Update that state when DB `current_turn_wallet` changes

### Timer Reset
When turn changes are detected via polling:
- Call `turnTimer.resetTimer()` to give the new turn-holder full time
- Set `timeoutFiredRef.current = false` if applicable

### Visibility Change Handler
Also add visibility change handler (like Backgammon lines 925-974) to force immediate poll when tab becomes visible.

## Expected Result After Fix

1. Player A makes move → Timer starts for Player B
2. Player B's timer expires (10 seconds)
3. Server records `turn_timeout` → Updates `current_turn_wallet` to Player A
4. Polling detects change → Updates `turnOverrideWallet` to Player A
5. UI now shows it's Player A's turn again
6. Toast: "Opponent skipped - 1/3 missed turns"
7. After 3 consecutive skips → Auto-forfeit triggers

## Verification Steps

1. Create private chess room with 10-second timer
2. Make one move each
3. Let timer expire (do nothing for 10+ seconds)
4. **Expected:** Turn passes to opponent, toast shows "1/3 missed turns"
5. Let opponent's timer expire
6. **Expected:** Turn passes back to you
7. Repeat until 3 consecutive timeouts → Auto-forfeit triggers
