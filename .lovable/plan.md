

## Fix: Turn Timer Doesn't Start Immediately After Dice Roll

### Problem Summary
When the start roll finalizes and it's **my turn first**, the turn timer doesn't appear immediately because:
1. The polling interval is 5 seconds (too slow for UX)
2. `useOpponentTimeoutDetection` only polls when it's NOT my turn
3. Chess has a fix for this; Backgammon/Checkers/Dominos/Ludo do not

### Step A: Verify Edge Function Returns Required Fields

**File**: `supabase/functions/game-session-get/index.ts`

**Current Query** (line 38-42):
```typescript
const { data: session, error: sessionError } = await supabase
  .from('game_sessions')
  .select('*, max_players, eliminated_players')
  .eq('room_pda', roomPda)
  .maybeSingle()
```

**Returned JSON Structure** (lines 136-142):
```json
{
  "ok": true,
  "session": {
    "turn_started_at": "2026-02-02T02:56:51Z",
    "turn_time_seconds": 60,
    "current_turn_wallet": "At...",
    // ...all other game_sessions columns
  },
  "receipt": null,
  "match": null,
  "acceptances": { ... }
}
```

**Status**: All required fields (`turn_started_at`, `turn_time_seconds`, `current_turn_wallet`) are included because the query uses `*` (select all columns). **No changes needed to edge function.**

---

### Step B: Add `fetchInitialTurnStartedAt` Effect to 4 Games

**Reference Implementation** (`src/pages/ChessGame.tsx` lines 696-714):
```typescript
// Fetch initial turn_started_at when game starts (for my turn display)
useEffect(() => {
  if (!startRoll.isFinalized || !roomPda || turnStartedAt) return;
  
  const fetchInitialTurnStartedAt = async () => {
    try {
      const { data } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      if (data?.session?.turn_started_at) {
        setTurnStartedAt(data.session.turn_started_at);
      }
    } catch (err) {
      console.error("[ChessGame] Failed to fetch initial turn_started_at:", err);
    }
  };
  
  fetchInitialTurnStartedAt();
}, [startRoll.isFinalized, roomPda, turnStartedAt]);
```

---

#### File 1: `src/pages/BackgammonGame.tsx`

**Context**: BackgammonGame doesn't have a separate sync effect like other games - it uses `onTurnStartedAtChange` callback in `useOpponentTimeoutDetection`. The effect should be inserted after line 855 (after the "Update myRole and currentTurnWallet" effect).

**Insert after line 855**:
```typescript
// Fetch initial turn_started_at when game starts (for my turn display)
useEffect(() => {
  if (!startRoll.isFinalized || !roomPda || turnStartedAt) return;
  
  const fetchInitialTurnStartedAt = async () => {
    try {
      const { data } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      if (data?.session?.turn_started_at) {
        setTurnStartedAt(data.session.turn_started_at);
      }
    } catch (err) {
      console.error("[BackgammonGame] Failed to fetch initial turn_started_at:", err);
    }
  };
  
  fetchInitialTurnStartedAt();
}, [startRoll.isFinalized, roomPda, turnStartedAt]);
```

---

#### File 2: `src/pages/CheckersGame.tsx`

**Context**: Has sync effect at lines 602-607. Insert the new effect after line 607.

**Insert after line 607**:
```typescript
// Fetch initial turn_started_at when game starts (for my turn display)
useEffect(() => {
  if (!startRoll.isFinalized || !roomPda || turnStartedAt) return;
  
  const fetchInitialTurnStartedAt = async () => {
    try {
      const { data } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      if (data?.session?.turn_started_at) {
        setTurnStartedAt(data.session.turn_started_at);
      }
    } catch (err) {
      console.error("[CheckersGame] Failed to fetch initial turn_started_at:", err);
    }
  };
  
  fetchInitialTurnStartedAt();
}, [startRoll.isFinalized, roomPda, turnStartedAt]);
```

---

#### File 3: `src/pages/DominosGame.tsx`

**Context**: Has sync effect at lines 785-790. Insert the new effect after line 790.

**Insert after line 790**:
```typescript
// Fetch initial turn_started_at when game starts (for my turn display)
useEffect(() => {
  if (!startRoll.isFinalized || !roomPda || turnStartedAt) return;
  
  const fetchInitialTurnStartedAt = async () => {
    try {
      const { data } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      if (data?.session?.turn_started_at) {
        setTurnStartedAt(data.session.turn_started_at);
      }
    } catch (err) {
      console.error("[DominosGame] Failed to fetch initial turn_started_at:", err);
    }
  };
  
  fetchInitialTurnStartedAt();
}, [startRoll.isFinalized, roomPda, turnStartedAt]);
```

---

#### File 4: `src/pages/LudoGame.tsx`

**Context**: Has sync effect at lines 652-657. Ludo uses `effectiveStartRoll.isFinalized` throughout (line 381-396), so must use that instead of `startRoll.isFinalized`.

**Insert after line 657**:
```typescript
// Fetch initial turn_started_at when game starts (for my turn display)
useEffect(() => {
  if (!effectiveStartRoll.isFinalized || !roomPda || turnStartedAt) return;
  
  const fetchInitialTurnStartedAt = async () => {
    try {
      const { data } = await supabase.functions.invoke("game-session-get", {
        body: { roomPda },
      });
      if (data?.session?.turn_started_at) {
        setTurnStartedAt(data.session.turn_started_at);
      }
    } catch (err) {
      console.error("[LudoGame] Failed to fetch initial turn_started_at:", err);
    }
  };
  
  fetchInitialTurnStartedAt();
}, [effectiveStartRoll.isFinalized, roomPda, turnStartedAt]);
```

---

### Summary of Changes

| File | Insertion Point | Uses |
|------|----------------|------|
| `BackgammonGame.tsx` | After line 855 | `startRoll.isFinalized` |
| `CheckersGame.tsx` | After line 607 | `startRoll.isFinalized` |
| `DominosGame.tsx` | After line 790 | `startRoll.isFinalized` |
| `LudoGame.tsx` | After line 657 | `effectiveStartRoll.isFinalized` |

### Why This Works

1. When `startRoll.isFinalized` becomes `true`, the effect triggers **immediately** (not waiting for 5s poll)
2. Fetches `turn_started_at` from database (set by `finalize_start_roll` RPC at the moment of dice roll)
3. `setTurnStartedAt` populates state
4. `useTurnCountdownDisplay` receives valid `turnStartedAt` and starts countdown
5. Timer visible on both devices within ~100ms of start roll completion

### Step C: Verification Checklist

After implementation:
- [ ] Build completes without errors
- [ ] Timer appears immediately on starting player's device after dice roll
- [ ] Timer appears immediately on opponent's device when it becomes their turn
- [ ] Timeout at 0 triggers turn skip (1st/2nd miss) or forfeit (3rd miss)
- [ ] Works for: Ranked Backgammon, Private Backgammon, Checkers, Dominos, Ludo

