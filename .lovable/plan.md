
# Fix: "0 SOL" on Share Card, Missing SOL on Match Page, and Chess Board Still Moving

## Three Issues Identified

### Issue 1: Share Card Shows "0 SOL" (In-Game)

**Root Cause:** When the game ends and the user opens the Share Result Card, the `solWonLamports` prop comes from `payoutInfo` (line 796 of GameEndScreen.tsx):
```text
solWonLamports={payoutInfo ? Math.round(payoutInfo.winnerPayout * LAMPORTS_PER_SOL) : 0}
```

`payoutInfo` is computed from on-chain room account data. After settlement, the room account is often closed (rent reclaimed), so `accountInfo` returns `null`, `payoutInfo` stays `null`, and the share card receives `0`.

The X tweet then says "Just won 0 SOL" because the `formatSol(0)` returns "0".

**Fix:** Fetch stake info from the database (`matches` table) as a fallback when on-chain data is unavailable. The `matches` table already has `stake_lamports` and `max_players` for settled games.

### Issue 2: Public Match Share Page (`/match/:roomPda`) Missing SOL

**Root Cause:** No row exists in `match_share_cards` for the given room. The fallback logic in `MatchShareCard.tsx` queries `matches` and computes the payout correctly (6.3M lamports x 2 x 0.95 = ~0.012 SOL). However, the `formatSol` function at line 19 returns "0" when `!lamports` evaluates to true -- and `0` is falsy in JavaScript. Since the computed value is non-zero (11,970,000), the public page should display correctly IF the fallback runs.

The real problem: the settlement process doesn't write a `match_share_cards` row. This means the share page always falls back to `matches`, which works but is fragile. A more robust fix would ensure the settle-game edge function writes to `match_share_cards`.

Additionally, the `formatSol` function should handle small amounts better (use `.toFixed(4)` instead of `.toFixed(3)` to show sub-0.001 SOL amounts).

### Issue 3: Chess Board Still Moves on Mobile

**Root Cause:** The TurnStatusHeader fix (opacity-0) was applied and looks correct in the code. However, there is another source of layout shift: the `animate-pulse` class on the "My Turn" badge (line 137). On mobile, the `animate-pulse` causes the element to scale slightly, which can trigger reflows. More importantly, looking at the broader ChessGame layout, the **status bar** below the board (lines 1400-1427) has a conditional `{!gameOver && ...}` that shows/hides the resign button, and the entire status bar changes its background gradient classes based on game state.

But the most likely culprit is actually the `TurnStatusHeader` having an `animate-pulse` on the main turn status box itself (line 83-85) -- the entire container has `shadow-[0_0_20px_rgba(...)]` that appears/disappears with `isMyTurn`, plus the `animate-pulse` and `animate-ping` effects inside. The `transition-all duration-300` on the main container (line 81) causes height/padding changes as the border styling changes between turn states.

**Fix:** Ensure the TurnStatusHeader main container has a fixed minimum height so the transition between "my turn" and "opponent's turn" states doesn't change the overall element dimensions. Remove `animate-ping` on the blur div that causes reflow.

---

## Technical Details

### File: `src/components/GameEndScreen.tsx`

**Lines 220-271 (useEffect for room status check):** Add a fallback that queries the `matches` table via Supabase when on-chain account data is unavailable (`accountInfo` is null). Use the `stake_lamports` and `max_players` from the database to compute `payoutInfo`.

Add after line 260 (after the `if (accountInfo?.data)` block):
```text
// Fallback: if on-chain account is closed (settled), get stake from matches table
if (!accountInfo?.data) {
  const { data: matchRow } = await supabase
    .from("matches")
    .select("stake_lamports, max_players")
    .eq("room_pda", roomPda)
    .maybeSingle();
  
  if (matchRow && matchRow.stake_lamports > 0) {
    const pot = matchRow.stake_lamports * (matchRow.max_players || 2);
    const fee = Math.floor(pot * FEE_BPS / 10_000);
    const winnerPayout = pot - fee;
    setStakeLamports(matchRow.stake_lamports);
    setPayoutInfo({
      pot: pot / LAMPORTS_PER_SOL,
      fee: fee / LAMPORTS_PER_SOL,
      winnerPayout: winnerPayout / LAMPORTS_PER_SOL,
    });
  }
}
```

### File: `src/components/ShareResultCard.tsx`

**Line 25-27 (formatSol):** Improve to show 4 decimal places and handle zero explicitly:
```text
function formatSol(lamports: number): string {
  if (!lamports || lamports <= 0) return "0";
  const sol = lamports / LAMPORTS_PER_SOL;
  return sol < 0.001 ? sol.toFixed(4) : sol.toFixed(3);
}
```

### File: `src/pages/MatchShareCard.tsx`

**Line 19-22 (formatSol):** Same improvement as ShareResultCard -- show 4 decimal places for small amounts.

### File: `src/components/TurnStatusHeader.tsx`

**Line 80-85 (main container):** Add `min-h-[56px]` to prevent height changes during turn transitions. Remove or tone down the shadow transition that causes reflow:
```text
className={cn(
  "flex items-center justify-between rounded-lg border px-4 py-3 transition-colors duration-300 min-h-[56px]",
  ...
)}
```

Change `transition-all` to `transition-colors` so only color/background animates, not size/padding/shadow.

**Line 91-92 (animate-ping div):** Remove the `animate-ping` effect on the Crown blur div, as it causes continuous reflow. Keep the `animate-pulse` on the Crown icon itself.

Remove:
```text
<div className="absolute inset-0 bg-primary/30 rounded-full blur-md animate-ping" />
```

### What is NOT touched
- No game logic, matchmaking, Solana program, or backend changes
- No database migrations needed (reads from existing `matches` table)
- No edge function changes
- PvP blocking and settlement flow unchanged
