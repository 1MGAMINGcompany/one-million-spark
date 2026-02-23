

# Audit: Free Games Anonymous Play -- Remaining Issues

## Status: Partially Fixed, Several Critical Gaps Remain

The wallet gate bypass and player-fetch logic were correctly added to all 5 game pages. However, many downstream uses of `address` throughout the game pages were NOT updated to fall back to `getAnonId()` for free rooms. This means anonymous players can now SEE the game board but will encounter broken behavior when trying to actually play.

---

## Issues Found

### 1. WebRTC Sync Uses Raw `address` (All Games)

`useWebRTCSync` internally calls `useWallet()` and uses `address` as `localAddress`. For anonymous players, `address` is null/empty, which means:
- WebRTC connection never establishes (`localAddress` is empty)
- `sendMove()`, `sendResign()`, `sendChat()` all fail silently
- Move communication between players is completely broken

**Fix:** Each game page should pass the effective player ID into WebRTC (or use Realtime-only mode for free rooms). The simplest fix is to make free rooms always use Realtime-only sync (which already works via Supabase channels without needing a wallet address as identity).

### 2. Chess: Color/Turn Detection Uses `address` Directly

In `ChessGame.tsx`, about 15 places use `isSameWallet(..., address)` for:
- Determining `myColor` (line 455)
- `isCreator` (line 487-488)
- `opponentWallet` (line 496-497)
- Turn override detection (line 517)
- Win/loss detection (line 612)
- Turn player mapping (line 664)
- Resign forfeit wallet (via `useForfeit` line 1001: `myWallet: address || null`)

When `address` is null, all of these evaluate incorrectly.

### 3. Backgammon: On-Chain Fallback Uses `address` (line 416)

After the free room fetch block, the on-chain fallback at line 416 does:
```typescript
const myIndex = realPlayers.findIndex(p => isSameWallet(p, address));
```
This is fine because the on-chain path is only reached for non-free rooms. However, there are many other places in BackgammonGame.tsx that use `address` directly for turn detection, move submission, etc. that would break for free room anonymous players.

### 4. Checkers: Same Pattern as Chess (line 205)

Uses `address` for seat/color assignment in the on-chain path. The free room path correctly uses `playerId`, but downstream turn detection, forfeit, and move submission still reference `address`.

### 5. Dominos: Same Pattern

Uses `address` in move submission callbacks, turn detection, and resign logic.

### 6. Ludo: Best Implemented

Ludo already has `effectivePlayerId = address || (isFreeRoom ? getAnonId() : null)` and uses it for `myPlayerIndex`. This is the correct pattern but may still have gaps in move submission and forfeit.

### 7. `useForfeit` Gets `address || null` (All Games)

All games pass `myWallet: address || null` to `useForfeit`. For anonymous players, this is null, so forfeit will fail with "Missing: wallet" error.

### 8. `useStartRoll` Checks `isRealWallet()` (line 82)

The hook skips session creation if players aren't "real wallets". Anonymous UUIDs will fail this check. However, for free rooms the session is already created by the `free-match` edge function, so this may be a non-issue if the hook is bypassed for free games.

---

## Fix Plan

### A. Create a shared helper: `useEffectivePlayerId` or compute it inline

Each game page needs a stable effective player ID:
```typescript
const effectivePlayerId = address || (isFreeRoom ? getAnonId() : null);
```

### B. Replace `address` with `effectivePlayerId` in all game pages

For each of the 5 game files, replace every downstream use of `address` that determines player identity with `effectivePlayerId`. Key locations:

- `isSameWallet(x, address)` calls for turn/color/win detection
- `useForfeit({ myWallet: address })` 
- `opponentWallet` computation
- `sendMove` wallet parameter
- `recordPlayerMove` calls
- Turn player mapping

### C. Fix WebRTC for free rooms

Two options:
1. **Simple**: Skip WebRTC entirely for free rooms and use Realtime-only (Supabase channels). Pass `effectivePlayerId` as the channel identity.
2. **Complex**: Thread `effectivePlayerId` into `useWebRTCSync` as an override.

Option 1 is simpler and more reliable since free rooms are already DB-based.

### D. Update `useStartRoll` guard

Add a bypass for free rooms so it doesn't try to validate "real wallets" or create sessions (the `free-match` edge function handles session creation).

### E. Update `useForfeit` for free rooms

Pass `effectivePlayerId` instead of `address` for `myWallet`. The free-room forfeit path in `useForfeit` (line 186-195) already handles DB-only cleanup, so this should work with anon IDs.

---

## Priority Order

1. **Chess + Ludo** (most tested games) -- fix all `address` references
2. **Checkers + Backgammon + Dominos** -- same pattern
3. **WebRTC bypass for free rooms** -- use Realtime-only
4. **useStartRoll guard** -- skip for free rooms
5. **useForfeit** -- pass effectivePlayerId

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/ChessGame.tsx` | ~15 `address` references to `effectivePlayerId` |
| `src/pages/BackgammonGame.tsx` | ~15+ `address` references |
| `src/pages/CheckersGame.tsx` | ~10 `address` references |
| `src/pages/DominosGame.tsx` | ~10 `address` references |
| `src/pages/LudoGame.tsx` | Mostly done, verify remaining gaps |
| `src/hooks/useWebRTCSync.ts` | Accept optional `overrideAddress` prop, or skip for free rooms at call site |

