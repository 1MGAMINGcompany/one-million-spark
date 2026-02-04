

# Mobile Crash Fix: Harden `useDurableGameSync.ts`

## Problem Summary
Mobile in-app browsers (Phantom, Solflare) experience crashes due to:
1. `TypeError: Cannot read property 'slice' of undefined` when realtime payload has undefined wallet
2. Game state being wiped during transient wallet disconnects (common in mobile)
3. Excessive channel resubscription when `onMoveReceived` callback is recreated

---

## Patch 1: Safe Realtime Logging + Guard Turn Number

**Location**: Lines 301-316 (realtime callback)

**Current Code (Crashes)**:
```typescript
(payload) => {
  const newMove = payload.new as GameMove;
  dbg("durable.realtime", { 
    turn: newMove.turn_number, 
    wallet: newMove.wallet.slice(0, 8),  // ← CRASH if wallet undefined
    type: newMove.move_data?.type
  });
  if (newMove.turn_number > lastTurnRef.current) { ... }
}
```

**Fixed Code**:
```typescript
(payload) => {
  const newMove = payload.new as Partial<GameMove>;

  const turn = typeof newMove.turn_number === "number" 
    ? newMove.turn_number 
    : null;

  const walletShort = typeof newMove.wallet === "string" 
    ? newMove.wallet.slice(0, 8) 
    : "unknown";

  dbg("durable.realtime", {
    turn,
    wallet: walletShort,
    type: (newMove as any)?.move_data?.type,
  });

  // Ignore malformed payloads
  if (turn === null) return;

  if (turn > lastTurnRef.current) {
    setMoves((prev) => [...prev, newMove as GameMove]);
    setLastHash((newMove as GameMove).move_hash);
    lastTurnRef.current = turn;
    onMoveReceivedRef.current?.(newMove as GameMove);
  }
}
```

---

## Patch 2: Guard State Reset Against Transient Disconnects

**Location**: Lines 397-404 (reset effect)

**Current Code (Wipes State on Undefined)**:
```typescript
useEffect(() => {
  loadedRef.current = false;
  setMoves([]);
  setLastHash("genesis");
  lastTurnRef.current = 0;
  setIsLoading(true);
}, [roomPda]);
```

**Fixed Code**:
```typescript
const prevRoomPdaRef = useRef<string | null>(null);

useEffect(() => {
  // Critical: avoid clearing state during transient disconnects
  if (!roomPda) return;

  // Only reset if roomPda actually changed
  if (prevRoomPdaRef.current === roomPda) return;
  prevRoomPdaRef.current = roomPda;

  loadedRef.current = false;
  setMoves([]);
  setLastHash("genesis");
  lastTurnRef.current = 0;
  setIsLoading(true);
}, [roomPda]);
```

---

## Patch 3: Prevent Resubscribe Thrash (Callback Ref Pattern)

**Location**: Add new refs at top of hook + update subscription effect

**Add After Line 57**:
```typescript
// Store callbacks in refs to prevent resubscribe thrash
const onMoveReceivedRef = useRef(onMoveReceived);
useEffect(() => {
  onMoveReceivedRef.current = onMoveReceived;
}, [onMoveReceived]);
```

**Update Line 387**:
```typescript
// Remove onMoveReceived from deps
}, [enabled, roomPda]);
```

---

## Technical Details

| Patch | Root Cause | Fix | Risk |
|-------|-----------|-----|------|
| 1 | Realtime payload can have undefined fields | Type as `Partial<GameMove>`, guard all accesses | Very low - defensive only |
| 2 | State reset runs even when `roomPda` becomes undefined | Guard with `if (!roomPda) return` + track previous value | Very low - prevents data loss |
| 3 | Subscription effect runs on callback recreation | Store in ref, remove from deps | Very low - standard React pattern |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useDurableGameSync.ts` | Apply all 3 patches |

---

## Testing

After implementation:
1. Test on mobile in-app browser (Phantom/Solflare)
2. Verify no crashes when receiving realtime moves
3. Simulate wallet disconnect/reconnect → game state should persist
4. Console should show `[DBG] durable.realtime` logs with `wallet: "unknown"` for malformed payloads (not crash)

