
# Fix Plan: DiceRollStart Gating + Stop False "Opponent sync timed out"

## ✅ COMPLETED - P0 UI FIX: DiceRollStart must never be blocked by RulesGate

**Problem:** The dice roll screen was blocked by RulesGate overlay even when DB shows dbReady=true (acceptedCount=2, participantsCount=2). Both `showDiceRoll` and `shouldShowRulesGate` were true simultaneously.

**Solution Applied:**
1. Compute `showDiceRoll = dbReady && !startRoll.isFinalized` (unchanged)
2. Compute `rawShouldShowRulesGate = dbReady && !!address && !startRoll.isFinalized`
3. Force `shouldShowRulesGate = rawShouldShowRulesGate && !showDiceRoll` (P0 FIX)
4. When `showDiceRoll=true`, render DiceRollStart directly (NO RulesGate wrapper)
5. When `shouldShowRulesGate=true` (and showDiceRoll=false), show RulesGate for loading/syncing
6. Added defensive log if both conditions ever become true simultaneously

**Files Updated:**
- src/pages/ChessGame.tsx
- src/pages/BackgammonGame.tsx
- src/pages/CheckersGame.tsx
- src/pages/DominosGame.tsx
- src/pages/LudoGame.tsx (2-player only; N-player Ludo bypasses dice roll system)

---

## Problem (Original Issue - for reference)

---

## File Changes

### `src/components/DiceRollStart.tsx`

#### Change 1: Add new state variables (after line 135)

```typescript
const [waitingForOpponent, setWaitingForOpponent] = useState(false);
const [dbParticipantsCount, setDbParticipantsCount] = useState<number>(0);
const [dbAcceptedCount, setDbAcceptedCount] = useState<number>(0);
const [dbRequiredCount, setDbRequiredCount] = useState<number>(2);
```

#### Change 2: Update the checkExistingRoll effect to track opponent readiness (lines 223-267)

Replace the existing `checkExistingRoll` logic to also check `participantsCount` and `acceptances`:

```typescript
useEffect(() => {
  let cancelled = false;
  
  const checkExistingRoll = async () => {
    try {
      const { data: resp, error } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      
      if (cancelled) return;
      
      if (error) {
        console.error("[DiceRollStart] Edge function error:", error);
        return;
      }

      const session = resp?.session;
      const acceptances = resp?.acceptances;
      const debug = resp?.debug;
      
      // P0 FIX: Detect missing session and show sync CTA
      if (!session) {
        console.warn("[DiceRollStart] ⚠️ game_sessions row is NULL - showing sync CTA");
        setSessionMissing(true);
        setWaitingForOpponent(false);
        return;
      }
      
      // Track participants and acceptances for gating
      const participantsCount = debug?.participantsCount ?? session?.participants?.length ?? 0;
      const acceptedCount = acceptances?.acceptedCount ?? 0;
      const requiredCount = acceptances?.requiredCount ?? 2;
      
      setDbParticipantsCount(participantsCount);
      setDbAcceptedCount(acceptedCount);
      setDbRequiredCount(requiredCount);
      
      // Gating: Check if opponent is ready
      const opponentReady = participantsCount >= 2 && acceptedCount >= requiredCount;
      
      if (!opponentReady) {
        console.log("[DiceRollStart] Waiting for opponent:", { participantsCount, acceptedCount, requiredCount });
        setWaitingForOpponent(true);
        setSessionMissing(false);
        return;
      }
      
      // Opponent is ready - allow dice roll
      setWaitingForOpponent(false);
      setSessionMissing(false);
      
      // Check if roll already finalized
      if (session?.start_roll_finalized && session.start_roll && session.starting_player_wallet) {
        const rollData = session.start_roll as unknown as StartRollResult;
        setResult(rollData);
        
        if (isPlayer1) {
          setPlayerDie(rollData.p1.die ?? rollData.p1.dice?.[0] ?? 1);
          setOpponentDie(rollData.p2.die ?? rollData.p2.dice?.[0] ?? 1);
        } else {
          setPlayerDie(rollData.p2.die ?? rollData.p2.dice?.[0] ?? 1);
          setOpponentDie(rollData.p1.die ?? rollData.p1.dice?.[0] ?? 1);
        }
        
        setPhase("result");
      }
    } catch (err) {
      console.error("[DiceRollStart] Failed to check existing roll:", err);
    }
  };

  checkExistingRoll();
  
  // Poll every 3 seconds to detect opponent joining
  const pollInterval = setInterval(checkExistingRoll, 3000);

  return () => {
    cancelled = true;
    clearInterval(pollInterval);
  };
}, [roomPda, isPlayer1]);
```

#### Change 3: Gate the 15-second timeout (lines 160-174)

Only start the timeout when opponent is ready AND we're not waiting:

```typescript
useEffect(() => {
  // DON'T start timeout if waiting for opponent or session missing
  if (waitingForOpponent || sessionMissing) {
    return;
  }
  
  // Start 15s timeout only when opponent is ready
  timeoutRef.current = setTimeout(() => {
    if (phase !== "result" && !fallbackUsedRef.current) {
      console.log("[DiceRollStart] 15s timeout - showing fallback options");
      setShowFallback(true);
    }
  }, 15000);
  
  return () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  };
}, [phase, waitingForOpponent, sessionMissing]);
```

#### Change 4: Add "Waiting for opponent" UI guard (after line 495, before line 497)

```typescript
// GATE: Waiting for opponent to join/accept - show friendly message, no timers
if (waitingForOpponent) {
  return (
    <div className="w-full min-h-[60vh] flex items-center justify-center p-4">
      <Card className="relative w-full max-w-lg p-6 md:p-8 border-amber-500/30 bg-card/95 shadow-[0_0_60px_-10px_hsl(45_93%_54%_/_0.3)]">
        <div className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2 border-amber-500/40 rounded-tl-lg" />
        <div className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2 border-amber-500/40 rounded-tr-lg" />
        <div className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2 border-amber-500/40 rounded-bl-lg" />
        <div className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2 border-amber-500/40 rounded-br-lg" />

        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Users className="w-12 h-12 text-amber-400 animate-pulse" />
          </div>
          <h2 className="font-display text-2xl mb-2 text-amber-400 drop-shadow-lg">
            {t("diceRoll.waitingForOpponent", "Waiting for Opponent")}
          </h2>
          <p className="text-muted-foreground text-sm mb-4">
            {t("diceRoll.opponentNotReady", "Your opponent needs to join and accept the game rules before you can roll.")}
          </p>
          
          <div className="flex justify-center items-center gap-2 text-sm text-muted-foreground mb-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{dbAcceptedCount}/{dbRequiredCount} {t("diceRoll.playersReady", "players ready")}</span>
          </div>
        </div>
        
        {/* Exit option */}
        {onLeave && (
          <div className="pt-4 border-t border-border/50 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onLeave}
              disabled={isLeaving}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              {isLeaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              {t("game.leave", "Leave")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
```

#### Change 5: Update handleRoll to not show "Opponent sync timed out" when waiting (lines 300-369)

In the error handling block (lines 316-337), replace the misleading timeout message:

```typescript
// Handle "waiting for player2" gracefully - return to waiting state without error
const errorMsg = rpcError.message || "";
if (errorMsg.includes("waiting for player2")) {
  console.log("[DiceRollStart] Player 2 not synced yet - returning to waiting state...");
  // Set waiting state instead of showing error
  setWaitingForOpponent(true);
  setIsSyncingOpponent(false);
  setError(null); // Clear any error
  setPhase("waiting");
  return;
}
```

---

## Summary of Changes

| Line Range | Change |
|------------|--------|
| After 135 | Add `waitingForOpponent`, `dbParticipantsCount`, `dbAcceptedCount`, `dbRequiredCount` state |
| 160-174 | Gate 15s timeout to only fire when opponent is ready |
| 223-267 | Update `checkExistingRoll` to track opponent readiness + add polling |
| 316-337 | Remove auto-retry loop, set `waitingForOpponent` instead of error |
| After 495 | Add "Waiting for Opponent" UI guard |

## Gating Logic Summary

```
if (session === null):
  → Show "Room Not Synced" + Sync Room CTA
  → NO timers

else if (participantsCount < 2 OR acceptedCount < requiredCount):
  → Show "Waiting for Opponent" with player count
  → Poll every 3s for opponent joining
  → NO timers, NO "sync timed out" error

else (opponent ready):
  → Show dice roll UI
  → Start 15s fallback timer
  → Allow roll
```

## Testing
- Create a room, verify "Waiting for Opponent" shows (not "sync timed out")
- Have opponent join and accept - verify dice roll becomes available
- Verify no 15s timeout fires while waiting for opponent
