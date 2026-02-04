# Fix Plan: Join Stability + DiceRollStart Gating

## ✅ COMPLETED - P0 JOIN STABILITY: Non-Blocking Polling

**Problem:** Join tx confirmed, `ensure_game_session` + `record_acceptance` + `ranked-accept` all succeeded (200 OK), but the direct table polling returned 0/0/0 due to RLS (no permissive SELECT policies), causing `join.db_sync.failed TIMEOUT` - a **false failure**.

**Solution Applied:**
1. Changed polling from blocking to **fire-and-forget async** (non-blocking)
2. Join now returns `ok:true` immediately after `record_acceptance` succeeds
3. Polling continues in background for **telemetry only**
4. New trace tags: `join.poll.nonblocking.start`, `join.poll.nonblocking.confirmed`, `join.poll.nonblocking.timeout`, `join.poll.nonblocking.error`
5. Navigation proceeds immediately - room page is DB-authoritative

**Files Updated:**
- src/hooks/useSolanaRooms.ts (lines 1072-1188)

**Control Flow After Fix:**
```
tx confirmed
  → ensure_game_session (REQUIRED - fails join if fails)
  → record_acceptance (REQUIRED - fails join if fails)
  → ranked-accept (BEST-EFFORT - try/catch, never fails join)
  → NON-BLOCKING poll (fire-and-forget telemetry, never fails join)
  → return { ok: true, signature }
  → navigate to /play/:roomPda
```

---

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

## Test Plan

### Test 1: Ranked Chess 2P
1. Create ranked chess room (wallet A)
2. Join from wallet B
3. **Expected:** Join navigates to `/play/:roomPda` without "Join failed to sync" toast
4. **Expected:** Console shows `join.poll.nonblocking.start` and possibly `join.poll.nonblocking.timeout` (OK - not blocking)
5. **Expected:** Dice roll appears immediately

### Test 2: Casual Chess 2P
1. Create casual (0 SOL) chess room
2. Join from second wallet
3. **Expected:** Same as above

### Test 3: Private Ludo 3P
1. Create private ludo room (max 3 players)
2. Join from 2 other wallets
3. **Expected:** Each join navigates correctly
4. **Expected:** Game starts when all 3 players ready
