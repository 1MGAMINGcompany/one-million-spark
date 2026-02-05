
# Fix Plan: Add Forfeit Button to WaitingForOpponentPanel

## Problem
When two players have paid and joined a ranked game room, but the sync system shows one player as still "waiting for opponent to accept," there is no way to forfeit the match. The current "Leave Match" button only navigates away without settling the on-chain stakes.

This leaves players with locked funds and no way to resolve the game.

## Solution
Add a Forfeit button to the `WaitingForOpponentPanel` component that appears when:
- 2+ players have joined (indicated by `playerCount >= 2` from on-chain data)
- There is a stake involved (`stakeSol > 0`)

The forfeit action will call the existing `forfeit-game` Edge Function which handles on-chain settlement.

## Implementation Details

### 1. Update `WaitingForOpponentPanel` Component

**File:** `src/components/WaitingForOpponentPanel.tsx`

Add new props:
- `stakeSol?: number` - The stake amount for display
- `playerCount?: number` - On-chain player count (2 = both joined)
- `onForfeit?: () => void` - Handler to trigger forfeit settlement
- `isForfeiting?: boolean` - Loading state during forfeit

Add a Forfeit button section that appears when `playerCount >= 2 && stakeSol > 0 && onForfeit`:

```text
Before changes:
┌────────────────────────────────────┐
│  [Status Icon]                     │
│  Room: 9myQJDpN                    │
│  ✓ You accepted the rules         │
│  ⏳ Waiting for opponent...        │
│                                    │
│  [Copy Invite Link]                │
│  Leave Match                       │
└────────────────────────────────────┘

After changes (when 2 players joined):
┌────────────────────────────────────┐
│  [Status Icon]                     │
│  Room: 9myQJDpN                    │
│  ✓ You accepted the rules         │
│  ⏳ Waiting for opponent...        │
│                                    │
│  ⚠️ Both players have joined...   │  ← NEW: Warning when 2 players but sync issue
│                                    │
│  [Copy Invite Link]                │
│  [🚩 Forfeit Match -0.005 SOL]     │  ← NEW: Forfeit button
│  Leave Match                       │
└────────────────────────────────────┘
```

### 2. Update Game Pages to Pass Props

**Files:** 
- `src/pages/BackgammonGame.tsx`
- `src/pages/ChessGame.tsx`
- `src/pages/CheckersGame.tsx`
- `src/pages/DominosGame.tsx`
- `src/pages/LudoGame.tsx`

Update the `RulesGate` component usage to pass:
- `stakeSol={entryFeeSol}`
- `playerCount={roomPlayers.length}` (from on-chain data)
- `onForfeit={forfeit}` (from useForfeit hook)
- `isForfeiting={isForfeiting}`

### 3. Update `RulesGate` Component

**File:** `src/components/RulesGate.tsx`

Add new props and pass them to `WaitingForOpponentPanel`:
- `stakeSol?: number`
- `playerCount?: number`
- `onForfeit?: () => void`
- `isForfeiting?: boolean`

### Technical Details

The forfeit action uses the existing `useForfeit` hook which:
1. Calls the `forfeit-game` Edge Function
2. Edge function executes `submit_result` on-chain with winner = opponent
3. Winner receives the pot, creator gets vault rent back
4. Game session is marked as finished in the database
5. Player is navigated to `/room-list`

The forfeit-game Edge Function already handles the case where `playerCount >= 2` and `status === 2` (Started) - it will correctly settle the match.

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/WaitingForOpponentPanel.tsx` | Add forfeit button, new props, warning message |
| `src/components/RulesGate.tsx` | Pass forfeit props to WaitingForOpponentPanel |
| `src/pages/BackgammonGame.tsx` | Pass forfeit props to RulesGate |
| `src/pages/ChessGame.tsx` | Pass forfeit props to RulesGate |
| `src/pages/CheckersGame.tsx` | Pass forfeit props to RulesGate |
| `src/pages/DominosGame.tsx` | Pass forfeit props to RulesGate |
| `src/pages/LudoGame.tsx` | Pass forfeit props to RulesGate |

## Expected Behavior After Fix

When a player is on the "Waiting for opponent to accept" screen but both players have actually joined:
1. A warning message appears explaining both players joined but sync may be delayed
2. A "Forfeit Match" button appears with the stake amount shown
3. Clicking forfeit triggers a confirmation dialog
4. Confirming forfeit settles the match on-chain (caller loses, opponent wins)
5. Both players can then exit cleanly with proper settlement
