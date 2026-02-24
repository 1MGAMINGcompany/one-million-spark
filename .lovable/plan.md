

# Fix Chess Ranked Win/Loss Detection + Victory Announcement

## Bug Root Cause

Both `checkGameOver` (line 1101) and `checkGameOverInline` (line 848) determine win/loss using `myColor`, but the actual source of truth is `effectiveColor` (derived from `startRoll.myColor`). Since creator always starts now (no dice roll), `myColor` can be stale -- causing both players to see "lost."

Additionally, `checkGameOver` never calls `setWinnerWallet(...)`, so the fallback `winnerAddress` logic (line 737-746) tries string-matching on `gameStatus`, which is fragile.

## Changes (single file: `src/pages/ChessGame.tsx`)

### Fix 1: Use effectiveColor in both checkGameOver functions

- Add `effectiveColorRef` (a ref tracking `effectiveColor`) so callbacks always have the current value
- Update `checkGameOverInline` (line 848): replace `myColor` with `effectiveColorRef.current`
- Update `checkGameOver` (line 1101): replace `myColor` with `effectiveColorRef.current`

### Fix 2: Set winnerWallet in checkGameOver

- Add `setWinnerWallet(winnerAddr)` in `checkGameOver` (the same logic already in `checkGameOverInline`)
- Add `setWinnerWallet("draw")` for draw/stalemate cases in `checkGameOver`

### Fix 3: 3-second victory announcement overlay

- Add two states: `victoryAnnouncement` (string or null) and `showEndScreen` (boolean)
- When checkmate is detected (in both checkGameOver functions), set `victoryAnnouncement` to "White won by checkmate!" or "Black won by checkmate!" based on which side delivered mate
- Start a 3-second timeout that clears the announcement and sets `showEndScreen = true`
- Render a centered golden overlay with the announcement text during those 3 seconds
- Gate the `GameEndScreen` on `showEndScreen` instead of `gameOver`
- For draws/stalemates/forfeits, show end screen immediately (no delay)

### Victory Announcement UI

A fixed overlay (z-50) with semi-transparent dark backdrop showing:
- Large golden text: "White won by checkmate!" or "Black won by checkmate!"
- Subtle scale-in animation
- Auto-dismisses after 3 seconds, then GameEndScreen appears

