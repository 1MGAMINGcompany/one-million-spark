

## Fix Plan: Turn Timer Enforcement and Room List Turn Time Display

### Problem Summary

Two related issues are preventing ranked multiplayer games from functioning correctly:

**Issue 1: Game gets stuck when turn timer expires**
- The database correctly records `turn_timeout` moves and updates `current_turn_wallet`
- But the waiting player (Player B) cannot play after opponent (Player A) times out
- Root cause: The `handleTurnTimeout` function has validation logic that silently returns early when called from opponent timeout detection

**Issue 2: Room List doesn't show turn time**
- The room list page should display the turn time for active games
- Data is available in `game_sessions.turn_time_seconds` but not displayed

---

## Technical Analysis

### Issue 1: Turn Timeout Logic Bug

In `ChessGame.tsx`, the `handleTurnTimeout` function (line 514-518) has this check:

```typescript
const timedOutWallet = (timedOutWalletArg || activeTurnAddress || null);
if (!timedOutWallet || !activeTurnAddress || !isSameWallet(timedOutWallet, activeTurnAddress)) return;
```

When `useOpponentTimeoutDetection` detects the opponent has timed out, it calls:
```typescript
handleOpponentTimeoutDetected(missedCount) 
  → handleTurnTimeout(opponentWallet)  // passes opponent's wallet
```

But `handleTurnTimeout` then compares `opponentWallet` to `activeTurnAddress`. If they don't match exactly (due to stale closures or case sensitivity), the function returns early without:
1. Setting `turnOverrideWallet` 
2. Persisting the `turn_timeout` move
3. Updating any UI state

### Issue 2: Room List Missing Turn Time

The `game-sessions-list` Edge Function already returns `turn_time_seconds` in its response. The `RoomList.tsx` component needs to:
1. Fetch active game session data
2. Display remaining turn time based on `turn_started_at + turn_time_seconds`

---

## Solution

### Part 1: Fix Turn Timeout Handler Logic

**File: `src/pages/ChessGame.tsx`**

Modify the `handleTurnTimeout` function to properly handle opponent timeouts detected by `useOpponentTimeoutDetection`. The key change is to allow processing when the timed-out wallet matches the opponent AND it's the opponent's turn.

1. Remove the validation check that prevents opponent timeout processing
2. Add explicit handling for "I'm waiting and opponent timed out" case
3. Ensure `turnOverrideWallet` is set to my wallet when opponent times out

**File: `src/pages/CheckersGame.tsx`, `src/pages/BackgammonGame.tsx`, `src/pages/DominosGame.tsx`**

Apply the same fix pattern to all game pages.

### Part 2: Improve Opponent Timeout Detection Hook

**File: `src/hooks/useOpponentTimeoutDetection.ts`**

1. After detecting timeout and calling the callback, actively set a flag that the parent component can use to immediately unlock the board
2. Track `lastProcessedTurnStartRef` using both `turn_started_at` AND `current_turn_wallet` to prevent duplicate processing after turn switches

### Part 3: Add Turn Time Display to Room List

**File: `src/pages/RoomList.tsx`**

1. Add a mapping from room PDA to active game session data (turn_started_at, turn_time_seconds)
2. Fetch this data from `game-sessions-list` with `type: 'active'` 
3. Display a countdown timer for rooms with active games showing remaining turn time

**UI Change:**
```
Current:
┌─────────────────────────────────────────────────────┐
│ Chess  #1769...  🔴 Ranked 🏆                       │
│ 💰 0.0041 SOL  👥 1/2  🕐 AtLG...BjF4        [Join] │
└─────────────────────────────────────────────────────┘

After Fix:
┌─────────────────────────────────────────────────────┐
│ Chess  #1769...  🔴 Ranked 🏆                       │
│ 💰 0.0041 SOL  👥 1/2  ⏱️ 10s turn  🕐 AtLG...     [Join] │
└─────────────────────────────────────────────────────┘
```

For rooms with an active session showing current turn time countdown.

---

## Implementation Steps

### Step 1: Fix handleTurnTimeout in ChessGame.tsx

```typescript
// Current problematic code:
const handleTurnTimeout = useCallback((timedOutWalletArg?: string | null) => {
  if (gameOver || !address || !roomPda) return;
  const timedOutWallet = (timedOutWalletArg || activeTurnAddress || null);
  if (!timedOutWallet || !activeTurnAddress || !isSameWallet(timedOutWallet, activeTurnAddress)) return;
  // ...
}, [...]);

// Fixed code:
const handleTurnTimeout = useCallback((timedOutWalletArg?: string | null) => {
  if (gameOver || !address || !roomPda) return;
  
  // Get the wallet that timed out
  const timedOutWallet = timedOutWalletArg || activeTurnAddress || null;
  if (!timedOutWallet) return;
  
  const iTimedOut = isSameWallet(timedOutWallet, address);
  const opponentWalletAddr = getOpponentWallet(roomPlayers, address);
  
  // If it's not my turn locally but we're processing a timeout, 
  // the opponent must have timed out - allow processing
  // (This handles useOpponentTimeoutDetection callbacks)
  
  // ... rest of logic ...
}, [...]);
```

### Step 2: Apply Same Fix to CheckersGame, BackgammonGame, DominosGame

### Step 3: Update RoomList.tsx

Add turn time display with countdown for active ranked games:

```typescript
// Add state for active sessions with turn data
const [activeSessionsMap, setActiveSessionsMap] = useState<Map<string, {
  turnStartedAt: string;
  turnTimeSeconds: number;
  currentTurnWallet: string;
}>>(new Map());

// Fetch active sessions with turn time data
useEffect(() => {
  const fetchActiveSessions = async () => {
    const { data } = await supabase.functions.invoke("game-sessions-list", {
      body: { type: "active" },
    });
    if (data?.rows) {
      const map = new Map();
      for (const row of data.rows) {
        map.set(row.room_pda, {
          turnStartedAt: row.turn_started_at,
          turnTimeSeconds: row.turn_time_seconds,
          currentTurnWallet: row.current_turn_wallet,
        });
      }
      setActiveSessionsMap(map);
    }
  };
  fetchActiveSessions();
  const interval = setInterval(fetchActiveSessions, 5000);
  return () => clearInterval(interval);
}, []);

// In room card display, add turn time countdown
{activeSessionsMap.has(room.pda) && (
  <TurnTimeDisplay 
    turnStartedAt={activeSessionsMap.get(room.pda)!.turnStartedAt}
    turnTimeSeconds={activeSessionsMap.get(room.pda)!.turnTimeSeconds}
  />
)}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Fix `handleTurnTimeout` validation logic |
| `src/pages/CheckersGame.tsx` | Apply same fix |
| `src/pages/BackgammonGame.tsx` | Apply same fix |
| `src/pages/DominosGame.tsx` | Apply same fix |
| `src/pages/RoomList.tsx` | Add turn time display component |
| `src/hooks/useOpponentTimeoutDetection.ts` | Improve turn switch detection key |

---

## Expected Outcome

1. **Turn timer works correctly**: When Player A's timer expires, Player B can immediately play regardless of who detected the timeout
2. **Room list shows turn time**: Active ranked games display their configured turn time (e.g., "10s turn") so players know the game's pace before joining
3. **No more stuck games**: The 3-strike forfeit rule works end-to-end

