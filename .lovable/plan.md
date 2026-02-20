
# Full Game Flow Audit — All Fixes

## What Was Audited

All 10 game entry points: 5 AI games (Chess, Backgammon, Dominos, Ludo, Checkers) and 5 multiplayer "Play for SOL" games (Chess, Backgammon, Dominos, Ludo, Checkers).

The share card and game-over flows are mostly correct. Four concrete bugs remain.

---

## Bug 1 — CheckersGame: Missing `isRematch` prop on GameEndScreen

**Impact:** The RivalryWidget (win streak tracker showing "5-game win streak vs opponent") never appears in Checkers rematches, unlike the other 4 games.

**Root cause:** `CheckersGame.tsx` line 1491 calls `<GameEndScreen>` without `isRematch`. The variable exists in the component — it comes from `rematch.checkRematchInvite(roomId)` at line 693 — but is never passed down.

**Fix:** Add `isRematch={isRematch}` to the GameEndScreen call in `CheckersGame.tsx`. The `isRematch` variable needs to be lifted out of the `useEffect` into component scope (currently it's a block-scoped const inside the effect).

---

## Bug 2 — CheckersGame: `isStaked` doesn't cover casual-SOL games

**Impact:** A player who creates a casual room with a SOL stake (e.g. 0.1 SOL casual mode) will NOT see the on-chain finalization UI in `GameEndScreen`. The share card will show 0 SOL even though they played for real money.

**Root cause:** `CheckersGame.tsx` line 1500 passes `isStaked={isRankedGame}`. But casual-mode games can also have a stake (`entryFeeSol > 0`). Compare with `DominosGame.tsx` which correctly passes `isStaked={isRankedGame || entryFeeSol > 0}` and `BackgammonGame.tsx` which passes `isStaked={isRankedGame && (stakeLamports ?? 0) > 0}`.

**Fix:** Change `isStaked={isRankedGame}` to `isStaked={isRankedGame || entryFeeSol > 0}` in `CheckersGame.tsx`.

---

## Bug 3 — ShareResultCard: SOL toggle shown even when no SOL was staked

**Impact:** In a truly free casual game (0 SOL), the share card shows a "SOL Won: 0.000" or "SOL Staked: 0.000" stat box, which is misleading and unprofessional.

**Root cause:** `ShareResultCard.tsx` line 196 renders the SOL stat box whenever `showSol` is true, regardless of whether any SOL is actually involved. The "SOL Amount" toggle in the customization panel also appears for free games.

**Clarification on user's point:** The user is correct — casual games CAN be played for real SOL. The fix is NOT to hide SOL based on `isRanked`. Instead, hide the SOL stat box and toggle only when BOTH `solWonLamports` and `solLostLamports` are 0 (truly no SOL at stake). When there IS SOL in a casual game, `GameEndScreen` fetches on-chain payout data and passes it correctly, so the amount will display.

**Fix:** In `ShareResultCard.tsx`:
- Derive `hasSolStake = (solWonLamports || 0) > 0 || (solLostLamports || 0) > 0`
- Only render the SOL stat box when `showSol && hasSolStake`
- Only render the "SOL Amount" toggle in the customization panel when `hasSolStake`
- Default `showSol` state to `true` but it only matters when `hasSolStake` is true

---

## Bug 4 — LudoAI: 2 hardcoded English strings not translated

**Impact:** Players using Japanese, Arabic, French, etc. see English text in the middle of a translated UI when playing Ludo vs AI.

**Root cause:** `LudoAI.tsx` lines 334–343 have two hardcoded strings:
- `"Select a token to move"` — shown when player has legal moves to pick from
- `"No moves available. Passing turn..."` — shown when player has no legal moves

**Fix:** Replace with `t()` calls using inline fallback defaults. The locale keys `ludo.selectToken` and `ludo.noMovesAI` already exist in all 10 language files — confirmed from previous audits.

---

## Complete Fix Table

| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | `src/pages/CheckersGame.tsx` | 691-699 | `isRematch` only exists inside `useEffect` scope | Lift `isRematch` to component state (`useState(false)`) |
| 1 | `src/pages/CheckersGame.tsx` | 1491 | Missing `isRematch={isRematch}` on GameEndScreen | Add the prop |
| 2 | `src/pages/CheckersGame.tsx` | 1500 | `isStaked={isRankedGame}` misses casual+SOL games | Change to `isStaked={isRankedGame \|\| entryFeeSol > 0}` |
| 3 | `src/components/ShareResultCard.tsx` | 63, 196, 251 | SOL row shows "0.000" for truly free games | Add `hasSolStake` guard; hide row and toggle when no SOL |
| 4 | `src/pages/LudoAI.tsx` | 334, 340 | Hardcoded English strings | Replace with `t("ludo.selectToken")` / `t("ludo.noMovesAI")` |

---

## What Is Already Correct (Confirmed During Audit)

- All 5 AI games fire `recordWin()`, `recordLoss()`, and `setShowShareCard(true)` on every game-over path (player move, chain capture, and AI move)
- All 5 multiplayer games show `GameEndScreen` with a share button for both winner and loser
- The `GameEndScreen` fetches on-chain payout data via `connection.getAccountInfo()` and passes it to `ShareResultCard` as `solWonLamports`
- The home page game cards now show translated "Play for SOL" and "Play vs AI Free" buttons in all 10 languages
- Chess, Backgammon, Ludo, and Dominos multiplayer games correctly pass `isRematch` to their GameEndScreen
