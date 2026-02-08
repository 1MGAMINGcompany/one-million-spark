

# Opponent Turn Timeout Polling for ChessGame

## Problem Analysis

When the creator closes their browser after the opponent joins, the game stalls because:

1. **Current behavior**: `handleTurnTimeout` is only triggered by `useTurnTimer` when `isMyTurn === true`
2. **Missing**: No polling mechanism to call `maybe_apply_turn_timeout` when it's the opponent's turn
3. **Impact**: Absent opponent never accumulates strikes, auto-forfeit never triggers

BackgammonGame has this polling (lines 740-922), but ChessGame lacks it entirely.

## Solution

Add a polling loop to ChessGame that mirrors the BackgammonGame pattern:

```text
┌─────────────────────────────────────────────────────────────────────┐
│                  OPPONENT TIMEOUT POLLING FLOW                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Game ACTIVE (isRanked + startRoll.isFinalized + !gameOver)        │
│       │                                                             │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ Poll every 3000ms (desktop) / 1500ms (wallet browser)   │       │
│  │ → Call game-session-get                                 │       │
│  │ → Get current_turn_wallet from DB                       │       │
│  └─────────────┬───────────────────────────────────────────┘       │
│                │                                                    │
│                ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ Is it opponent's turn? (dbTurnWallet !== myWallet)      │       │
│  └─────────────┬───────────────────────────────────────────┘       │
│                │                                                    │
│         ┌──────┴──────┐                                            │
│         │             │                                             │
│    [MY TURN]    [OPPONENT'S TURN]                                  │
│         │             │                                             │
│         ▼             ▼                                             │
│    Skip timeout  ┌────────────────────────────────────────┐        │
│    check         │ Call maybe_apply_turn_timeout(roomPda) │        │
│                  └─────────────┬──────────────────────────┘        │
│                                │                                    │
│                                ▼                                    │
│                  ┌────────────────────────────────────────┐        │
│                  │ If result.applied:                     │        │
│                  │   - type: "auto_forfeit" → I WIN       │        │
│                  │   - type: "turn_timeout" → turn to me  │        │
│                  │   Update local state + toast           │        │
│                  └────────────────────────────────────────┘        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation

### 1. Add Polling Interval Constants

Add constants at the top of ChessGame.tsx:

```typescript
const POLL_INTERVAL_DESKTOP = 3000; // 3 seconds
const POLL_INTERVAL_WALLET = 1500;  // 1.5 seconds for wallet browsers
```

### 2. Add State for Tracking DB Session Status

Add state variable to track database session status:

```typescript
const [dbSessionStatus, setDbSessionStatus] = useState<string | null>(null);
```

### 3. Add Polling Effect for Opponent Turn Timeout

Add a new useEffect after the existing turn timer setup (around line 575):

```typescript
// === OPPONENT TURN TIMEOUT POLLING ===
// This polls the server to apply timeouts when opponent is idle
// Mirrors BackgammonGame polling pattern (lines 740-922)
useEffect(() => {
  if (!roomPda || !isRankedGame || !startRoll.isFinalized || gameOver) return;

  const pollInterval = isWalletInAppBrowser() ? POLL_INTERVAL_WALLET : POLL_INTERVAL_DESKTOP;

  const pollOpponentTimeout = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });

      if (error) {
        console.warn("[ChessGame] Poll error:", error);
        return;
      }

      // Check if game finished while we weren't looking
      const dbStatus = data?.session?.status;
      setDbSessionStatus(dbStatus);
      
      if (dbStatus === 'finished' && !gameOver) {
        const dbWinner = data?.session?.winner_wallet;
        console.log("[ChessGame] Polling detected game finished. Winner:", dbWinner?.slice(0, 8));
        setGameOver(true);
        setWinnerWallet(dbWinner);
        // Determine if I won or lost
        if (isSameWallet(dbWinner, address)) {
          setGameStatus(t("gameMultiplayer.checkmateYouWin"));
          play('chess_win');
        } else {
          setGameStatus(t("gameMultiplayer.checkmateYouLose"));
          play('chess_lose');
        }
        return;
      }

      // Skip if game is over
      if (gameOver) return;

      // === SERVER-SIDE TIMEOUT CHECK ===
      const dbTurnWallet = data?.session?.current_turn_wallet;
      const isOpponentsTurn = dbTurnWallet && !isSameWallet(dbTurnWallet, address);

      if (isOpponentsTurn && dbStatus !== 'finished') {
        try {
          const { data: timeoutResult } = await supabase.rpc("maybe_apply_turn_timeout", {
            p_room_pda: roomPda,
          });

          const result = timeoutResult as {
            applied: boolean;
            type?: string;
            reason?: string;
            winnerWallet?: string;
            nextTurnWallet?: string;
            strikes?: number;
          } | null;

          if (result?.applied) {
            console.log("[ChessGame] Polling applied opponent timeout:", result);

            if (result.type === "auto_forfeit") {
              // Opponent forfeited by 3 strikes - I WIN
              setGameOver(true);
              setWinnerWallet(result.winnerWallet || address);
              setGameStatus(t("gameSession.opponentForfeited"));
              play('chess_win');
              toast({
                title: t("gameSession.opponentForfeited"),
                description: t("gameSession.youWin"),
              });
            } else if (result.type === "turn_timeout" && result.nextTurnWallet) {
              // Turn passed to me
              setTurnOverrideWallet(result.nextTurnWallet);
              turnTimer.resetTimer();
              toast({
                title: t("gameSession.opponentSkipped"),
                description: `${result.strikes}/3 ${t("gameSession.missedTurns")}`,
              });
            }
          }
        } catch (err) {
          console.warn("[ChessGame] Polling timeout check failed:", err);
        }
      }

      // Update turn override if DB says turn changed
      if (dbTurnWallet && dbTurnWallet !== (turnOverrideWallet || activeTurnAddress)) {
        console.log("[ChessGame] Polling detected turn change:", {
          from: (turnOverrideWallet || activeTurnAddress)?.slice(0, 8),
          to: dbTurnWallet.slice(0, 8),
        });
        
        const isNowMyTurn = isSameWallet(dbTurnWallet, address);
        if (isNowMyTurn) {
          setTurnOverrideWallet(dbTurnWallet);
          turnTimer.resetTimer();
        }
      }
    } catch (err) {
      console.error("[ChessGame] Poll exception:", err);
    }
  };

  // Initial poll
  pollOpponentTimeout();

  // Set up interval
  const interval = setInterval(pollOpponentTimeout, pollInterval);
  
  return () => clearInterval(interval);
}, [
  roomPda, isRankedGame, startRoll.isFinalized, gameOver, 
  address, turnOverrideWallet, activeTurnAddress, 
  turnTimer, play, t
]);
```

### 4. Add Visibility Change Handler

Add a visibility change handler to force immediate poll when tab becomes visible:

```typescript
// Visibility change handler - poll immediately when tab becomes visible
useEffect(() => {
  if (!roomPda || !isRankedGame || gameOver) return;
  
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log("[ChessGame] Tab became visible - forcing sync");
      
      // Force immediate sync
      supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      }).then(({ data }) => {
        const dbTurnWallet = data?.session?.current_turn_wallet;
        if (dbTurnWallet && !isSameWallet(dbTurnWallet, activeTurnAddress)) {
          console.log("[ChessGame] Visibility poll detected turn change");
          
          const isNowMyTurn = isSameWallet(dbTurnWallet, address);
          if (isNowMyTurn) {
            setTurnOverrideWallet(dbTurnWallet);
            turnTimer.resetTimer();
          }
        }
        
        // Also resume timer if paused
        if (!turnTimer.isPaused) {
          turnTimer.resumeTimer();
        }
      }).catch(err => {
        console.warn("[ChessGame] Visibility poll error:", err);
      });
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [roomPda, isRankedGame, gameOver, activeTurnAddress, address, turnTimer]);
```

### 5. Import `isWalletInAppBrowser`

Add import at the top of ChessGame.tsx:

```typescript
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
```

## Files to Change

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Add polling constants, dbSessionStatus state, opponent timeout polling effect, visibility change handler, import for `isWalletInAppBrowser` |

## Safety Considerations

1. **Idempotent**: `maybe_apply_turn_timeout` is safe to call multiple times
2. **No auto-forfeit by joiner**: The forfeit only happens server-side after 3 strikes
3. **DB-authoritative**: All timeout logic is validated server-side with `FOR UPDATE` locks
4. **Minimal UI changes**: Only adds polling, doesn't change game logic

## Testing Checklist

After implementation, test:
1. Creator creates ranked game, opponent joins, creator closes window
2. Opponent should see turn timer counting down for creator
3. After 3 timeouts, game should auto-forfeit with opponent winning
4. Tab switching should properly resume timer and detect turn changes

