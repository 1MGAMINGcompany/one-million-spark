

# Fix: Settlement Failure, Room List Turn Times, and Share Card Display

## Three Root Causes Found

### 1. Settlement is BROKEN -- match_share_cards is empty (all 0.0000 SOL on share page)

**Root Cause**: The `settle-game` edge function tries to determine the winner using `game_state.winnerSeat` or `game_state.gameOver` as a seat index (number 0-3) or color string ("white"/"black"). But **no game** ever sets `winnerSeat` -- all games save `gameOver: true` (boolean). The function sees `true` (not a string/number), hits the "No winnerSeat or gameOver found" error, and returns early. Settlement never completes, so:
- `match_share_cards` table is empty (0 rows)
- The share page shows 0.0000 SOL because `match-get` falls back to `game_sessions` which has no payout data

**Evidence**: The settle-game logs show repeated errors: `Cannot resolve winner seat: No winnerSeat or gameOver found in game_state`. The DB confirms every finished game has `game_over_val: true` (boolean) and `winner_seat: null`.

**Why it "worked before"**: Settlement logic was recently refactored to use `resolveWinnerSeat`. Before that, it likely used `winner_wallet` directly from the session, which games DO set correctly.

**Fix**: Add a fallback in `resolveWinnerSeat` -- when `gameOver` is boolean `true`, fetch `winner_wallet` from the session and match it against the on-chain `players[]` array to determine the seat index. Alternatively (simpler and more robust), modify the `settle-game` function to check `winner_wallet` from the session as a direct fallback when `resolveWinnerSeat` fails.

### 2. Room List shows "--" for turn time

**Root Cause**: The room enrichment works correctly -- `game-sessions-list` returns sessions with `turn_time_seconds`. But the issue is a **race condition**: The `game-session-set-settings` edge function inserts the session with the turn time, but this only happens AFTER the on-chain transaction confirms. If the room list polls before the settings are saved, the session doesn't exist yet.

Additionally, the `turnTimeSec` default in `parseRoomAccount` (solana-program.ts line 305) is `0`, which renders as "--" in the UI. The enrichment only overwrites this if it finds a matching `room_pda` in the edge function response.

For the specific room in the screenshot (#1770662936379), the `game-session-set-settings` was called successfully (the session exists with `turn_time_seconds`), so this might be a timing issue where the room list polled before enrichment completed. However, the enrichment code looks correct.

**Fix**: This is likely already working but has a timing window. No code change needed -- the 5s polling will pick it up on next cycle. If persistent, we should log whether the enrichment map contains the room PDA.

### 3. Share page shows "WON {{AMOUNT}} SOL" literally

**Root Cause**: The `en.json` translation key is `"wonAmount": "Won {{amount}} SOL"` with i18next interpolation, but `MatchShareCard.tsx` line 109 calls `t("shareMatch.wonAmount", "Won")` WITHOUT passing the `amount` parameter. The fallback default "Won" works, but the actual translation has `{{amount}}` which renders literally.

**Fix**: Either remove the `{{amount}}` from the translation key (since the amount is displayed separately below), or pass the interpolation value. Since the component already shows the amount on a separate line, the simpler fix is to change the translation key to just "Won" or use a different key.

## Technical Changes

| File | Change |
|------|--------|
| `supabase/functions/settle-game/index.ts` | Add fallback: when `resolveWinnerSeat` fails, use `winner_wallet` from `game_sessions` to find seat index in on-chain `players[]` |
| `src/i18n/locales/en.json` | Fix `wonAmount` translation key to remove `{{amount}}` interpolation since amount is shown separately |
| `src/components/MatchShareCard.tsx` | Use fallback translation string correctly |

### settle-game fix (most critical)

After `resolveWinnerSeat` fails (line 506), add a fallback path:

```typescript
if ("error" in seatResult) {
  // FALLBACK: Use winner_wallet from game_sessions (set by frontend)
  const { data: winnerRow } = await supabase
    .from("game_sessions")
    .select("winner_wallet")
    .eq("room_pda", roomPda)
    .single();

  if (winnerRow?.winner_wallet) {
    const seatFromWallet = playersOnChain.indexOf(winnerRow.winner_wallet);
    if (seatFromWallet >= 0) {
      // Use this as the resolved seat
      console.log("[settle-game] Fallback: resolved winner from session.winner_wallet", {
        wallet: winnerRow.winner_wallet.slice(0, 8),
        seat: seatFromWallet,
      });
      // Continue with settlement using seatFromWallet...
    }
  }
  // Only error out if fallback also fails
}
```

Also update all game pages to save `winnerSeat` in `game_state` for future-proofing (chess saves seat 0 for white win, 1 for black win, etc.).

### Translation fix

In `en.json`, change:
```json
"wonAmount": "Won {{amount}} SOL"
```
to:
```json
"wonAmount": "Won"
```

Since the actual SOL amount is already displayed prominently in its own element below this label.

### Game page fix (future-proofing)

Update `saveChessSession` (and equivalent in other games) to include `winnerSeat` in the persisted state when game is over. For chess: white wins = seat 0, black wins = seat 1. This prevents the settle-game fallback from being needed in the future.

