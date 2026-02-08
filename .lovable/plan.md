# Plan Complete

Opponent turn timeout polling has been implemented in ChessGame.tsx.

## What was added:

1. **Import + Constants** (lines 4-8):
   - `isWalletInAppBrowser` from walletBrowserDetection
   - `POLL_INTERVAL_DESKTOP = 3000` (3 seconds)
   - `POLL_INTERVAL_WALLET = 1500` (1.5 seconds)

2. **Opponent Timeout Polling Effect** (after `activeTurnAddress`):
   - Runs when: `roomPda && isRankedGame && startRoll.isFinalized && !gameOver`
   - Polls `game-session-get` to get current DB state
   - When opponent's turn: calls `maybe_apply_turn_timeout` RPC
   - Handles `auto_forfeit` (3 strikes → opponent wins)
   - Handles `turn_timeout` (turn passed to player, shows toast with strike count)

3. **Visibility Change Handler**:
   - Forces immediate sync when tab becomes visible
   - Detects game completion and turn changes that occurred while away
   - Resumes timer if paused

## Testing:
1. Create ranked chess game with short turn timer (e.g., 5s)
2. Join from another device
3. Close creator's window after join
4. Joiner should see creator's turn timeout, then turn passes back
5. After 3 consecutive timeouts, game auto-forfeits and joiner wins
