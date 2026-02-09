

# Debugging 3 Failing Tests: Root Cause + Patches

---

## Failure #1: Chess after timeout -- black cannot move

**Root Cause:** `src/pages/ChessGame.tsx`, line 519

```typescript
const isMyTurnFromEngine = game.turn() === effectiveColor && !gameOver;
```

When a timeout happens, the server flips `current_turn_wallet` to the opponent. The polling code at line 708/730 sets `turnOverrideWallet` to the new wallet. **However**, `game.turn()` still returns the OLD color because no chess.js move was made -- the timeout is a server-only event that does not advance the chess.js FEN.

The override logic at line 522-525 works:
```typescript
const isMyTurnOverride = turnOverrideWallet
  ? isSameWallet(turnOverrideWallet, address)
  : null;
const isActuallyMyTurn = isMyTurnOverride ?? isMyTurnFromEngine;
```

**BUT** the board's `disabled` prop at line 1372 is `disabled={gameOver || !isMyTurn}`, where `isMyTurn = canPlay && isActuallyMyTurn`. The problem: when the override says "it's your turn", `isActuallyMyTurn` is true. But the chess.js engine at `handleMove` (line 1176-1177) does:

```typescript
if (!isMyTurn || gameOver) return false;
```

Then at line 1184, `gameCopy.move({from, to, ...})` is called. **chess.js will reject the move** because `game.turn()` still returns the timed-out player's color (e.g., `'w'`) -- the FEN was never updated to reflect the skipped turn.

**The Fix:** After a timeout is detected (polling line 705-713), inject a null-move into chess.js to advance the turn. Chess.js doesn't support null moves, so we need to manually flip the turn in the FEN string.

**Patch location:** `src/pages/ChessGame.tsx`, inside the `turn_timeout` handler at line 705-713, after `setTurnOverrideWallet(result.nextTurnWallet)`:

```typescript
// Flip chess.js turn to match server state
setGame(prev => {
  const fen = prev.fen();
  // FEN format: pieces activeColor castling enPassant halfmove fullmove
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; // flip active color
  try {
    return new Chess(parts.join(' '));
  } catch {
    return prev; // safety fallback
  }
});
```

Same fix needed at the visibility handler (line 782-789) and the main polling turn-change block (line 722-733) when the turn flips to the local player after a timeout.

**Verification checklist:**
1. Create ranked chess game with 10s turns between two wallets
2. Let White's timer expire (do NOT move)
3. Server logs show `turn_timeout` recorded and `current_turn_wallet` flipped to Black
4. Black's board is NOT disabled -- Black can click and move a piece
5. chess.js accepts the move (no console error "Invalid move")

---

## Failure #2: match_share_cards missing after settlement

**Root Cause:** `supabase/functions/settle-game/index.ts`, line 886-887 and `supabase/functions/forfeit-game/index.ts`, line 865-867

The `match_share_cards` upsert (settle-game line 961, forfeit-game line 941) is inside a `try` block that only executes AFTER the on-chain `submit_result` transaction succeeds. When the on-chain tx fails (e.g., `AccountNotInitialized` error from last test), the code throws at line 887, jumps to the catch block, and the entire "DATABASE RECORDING" section (lines 909-985) is **skipped**.

The catch block in settle-game (around line 1050+) marks the session as `status_int: 4` (void) but never writes `match_share_cards`.

**The Fix:** In the catch block of both `settle-game` and `forfeit-game`, add a `match_share_cards` upsert with `win_reason: "void"` or at minimum ensure the Share button has data even when settlement fails. However, the more correct fix is: **the on-chain tx should not fail**. The `AccountNotInitialized` error from the last test means the vault PDA was not initialized. This is a room-creation issue, not a settlement code issue.

**Two-part fix:**

**Part A (immediate -- show share card even on failed settlement):** In the catch block of both edge functions, upsert a `match_share_cards` row with `tx_signature: null` and `win_reason: "settlement_failed"`.

Patch location: `supabase/functions/forfeit-game/index.ts` and `supabase/functions/settle-game/index.ts`, in the catch block after the `status_int: 4` update.

```typescript
// Still record share card so UI can show result
try {
  await supabase.from("match_share_cards").upsert({
    room_pda: roomPda,
    game_type: gameType || "unknown",
    mode: "ranked",
    stake_lamports: Number(roomData.stakeLamports),
    winner_wallet: winnerWallet,
    loser_wallet: forfeitingWallet, // or derived loser
    win_reason: "settlement_failed",
    winner_payout_lamports: 0,
    fee_lamports: 0,
    tx_signature: null,
    finished_at: new Date().toISOString(),
    metadata: { payout_direction: "failed", error: errMsg },
  }, { onConflict: "room_pda" });
} catch (e) {
  console.warn("[forfeit-game] share card fallback failed:", e);
}
```

**Part B (root cause -- vault AccountNotInitialized):** This needs investigation of the room creation flow. The vault PDA was likely never funded or was already closed. This is the REAL issue causing missing payouts AND missing share cards. I need the `roomPda` from the failed test to check on-chain state.

**Verification checklist:**
1. Create ranked game, play to completion or forfeit
2. Check edge function logs for `match_share_cards recorded`
3. Query `SELECT * FROM match_share_cards WHERE room_pda = '<roomPda>'` -- row must exist
4. GameEndScreen shows "Share" button
5. Clicking Share opens the match card with correct data

---

## Failure #3: Solflare QR loop in in-app browser

**Root Cause:** `src/components/WalletButton.tsx`, line 214 and `src/components/ConnectWalletGate.tsx`, line 130

When a user scans a QR code and opens the site in Solflare's in-app browser:

1. `getIsInWalletBrowser()` returns `true` (line 44-51 in WalletButton.tsx) because `window.solflare.isSolflare` is set
2. The auto-sync effect at line 377-401 runs ONCE on mount, checks `win.solana?.isConnected` -- but Solflare does NOT set `window.solana`. It uses `window.solflare` instead.
3. So the auto-sync silently skips (line 387: `win.solana?.isConnected` is falsy for Solflare)
4. User sees "Connect Wallet" button, clicks it
5. `handleSelectWallet` (line 198) calls `select()` then... **does NOT call `connect()`** (line 214-215: only `select` + close dialog)
6. The wallet adapter state is "selected but not connected"
7. Nothing happens. User clicks connect again. Loop.

Compare with `ConnectWalletGate.tsx` line 129-131 which DOES call `await connect()` after `select()`.

**The Fix:** Two changes in `src/components/WalletButton.tsx`:

**Fix A (line 214-215):** Add `await connect()` after `select()`, matching ConnectWalletGate behavior:

```typescript
select(selectedWallet.adapter.name);
setDialogOpen(false);
await connect(); // <-- ADD THIS
```

**Fix B (line 387):** Check `window.solflare` in addition to `window.solana` for auto-sync:

```typescript
const solProvider = win.solflare || win.solana;
if (solProvider?.isConnected && solProvider?.publicKey) {
```

**Verification checklist:**
1. Open Solflare app on mobile
2. Navigate to the game URL in Solflare's in-app browser
3. Tap "Connect Wallet" and select Solflare
4. Wallet connects successfully (no loop back to connect screen)
5. Navigate to a room -- wallet stays connected, no re-prompt

---

## Summary of All Patches

| # | File | Line | Fix |
|---|------|------|-----|
| 1 | `src/pages/ChessGame.tsx` | 705-713 (+ 722-733, 782-789) | Flip chess.js FEN active color after timeout/turn-change |
| 2a | `supabase/functions/forfeit-game/index.ts` | catch block (~line 1050) | Upsert `match_share_cards` even on tx failure |
| 2b | `supabase/functions/settle-game/index.ts` | catch block (~line 1080) | Same as 2a |
| 3a | `src/components/WalletButton.tsx` | 214-215 | Add `await connect()` after `select()` |
| 3b | `src/components/WalletButton.tsx` | 387 | Check `window.solflare` for auto-sync |

No database changes needed.

