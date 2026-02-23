

# Fix Ludo Multiplayer -- 5 Critical Bugs ✅ COMPLETED

## Root Cause Analysis

The Ludo multiplayer game has several interconnected bugs that make it unplayable:

### Bug 1: Dice Rolls Automatically (AI plays opponent's turns)

In `LudoGame.tsx` lines 1022-1088, there's an AI turn handler that auto-rolls dice for ANY player index that isn't `myPlayerIndex`. In a 2-player multiplayer game, when it's the opponent's turn, the code treats them as an AI player and auto-rolls/auto-moves for them. This is why dice are "rolling alone" on mobile 1.

The fix: The AI turn effect should only run for player indices that are truly empty slots (beyond `roomPlayers.length`), not for real opponent players.

### Bug 2: Can't Select Pieces After Rolling 6

This is a consequence of Bug 1. Because the AI handler intercepts the opponent's turn and auto-rolls, it also clears `movableTokens` and manages the phase. When it cycles back to the human player, state may be inconsistent. Additionally, `applyExternalMove` at line 383 is a **stub that does nothing** -- it just logs and returns `true`. So moves received via WebRTC are never actually applied to the board state.

### Bug 3: All 4 Colors Show in 2-Player Game

`initializePlayers()` always creates 4 players (gold, ruby, sapphire, emerald). The board always renders all 4 home bases (line 591-598) and all 4 sets of tokens. For a 2-player game, only 2 colors should be visible.

### Bug 4: 2-Player Colors Are Adjacent (Not Opposite)

In a 2-player game, `roomPlayers` has 2 entries at indices 0 and 1 (gold and ruby -- adjacent corners). Standard Ludo places 2 players at **opposite corners** (gold and sapphire) for fairness. The `playerMod` just cycles `(index + 1) % 2`, so it alternates between gold (index 0) and ruby (index 1) which are next to each other on the board.

### Bug 5: "4-Player Multiplayer" Hardcoded Label

Line 1189 always says "4-Player Multiplayer" regardless of actual player count.

## Fix Plan

### 1. Fix Player Initialization for Variable Player Count

**File: `src/components/ludo/ludoTypes.ts`**

Add a new function `initializePlayersForCount(count: number)` that:
- For 2 players: creates gold (index 0) and sapphire (index 2) as active, marks both as `isAI: false`
- For 3 players: creates gold, ruby, emerald as active
- For 4 players: all four active

This determines which colors/corners are used based on player count.

### 2. Fix useLudoEngine to Support Multiplayer Properly

**File: `src/hooks/useLudoEngine.ts`**

- Accept a new option `activeSlots: number[]` (e.g., `[0, 2]` for 2-player) that tells the engine which player indices are active
- Modify turn advancement to skip inactive slots: instead of `(prev + 1) % playerMod`, step to the next active slot
- Implement `applyExternalMove` properly: given a `LudoMove`, update the correct player's token position, handle captures, check winner

### 3. Fix LudoGame.tsx AI Turn Handler

**File: `src/pages/LudoGame.tsx`**

- The AI turn effect (lines 1022-1088) must check if `currentPlayerIndex` corresponds to a real multiplayer opponent (exists in `roomPlayers`). If yes, do NOT auto-roll -- wait for WebRTC/durable sync move. Only auto-roll for truly empty AI slots (if any exist beyond the room's player count, which shouldn't happen with fix #1).
- Map `roomPlayers[0]` to the correct color slot (e.g., gold) and `roomPlayers[1]` to the opposite slot (e.g., sapphire for 2-player).

### 4. Fix LudoBoard to Hide Inactive Players

**File: `src/components/ludo/LudoBoard.tsx`**

- Accept a new prop `activePlayerIndices?: number[]`
- Only render home bases for active players
- Only render tokens for active players
- Gray out / hide inactive corners

### 5. Fix Display Labels

**File: `src/pages/LudoGame.tsx`**

- Change "4-Player Multiplayer" to dynamically show the correct player count
- Player status footer should only show active players

## Technical Details

### Player Slot Mapping for 2-Player Games

Standard Ludo 2-player uses opposite corners:

```text
  Gold (0)     [empty]
     \           /
      [  BOARD  ]
     /           \
  [empty]    Sapphire (2)
```

Player 1 (roomPlayers[0]) maps to index 0 (gold, top-left)
Player 2 (roomPlayers[1]) maps to index 2 (sapphire, bottom-right)

Turn cycle: 0 -> 2 -> 0 -> 2 (skip indices 1 and 3)

### Player Slot Mapping for 3-Player Games

```text
  Gold (0)     Ruby (1)
     \           /
      [  BOARD  ]
     /           \
  Emerald (3)   [empty]
```

Turn cycle: 0 -> 1 -> 3 -> 0 (skip index 2)

### Files Modified

| File | Changes |
|------|---------|
| `src/components/ludo/ludoTypes.ts` | Add `initializePlayersForCount()`, `getActiveSlots()` |
| `src/hooks/useLudoEngine.ts` | Accept `activeSlots`, fix turn cycling, implement `applyExternalMove` |
| `src/pages/LudoGame.tsx` | Fix AI handler to not play opponent turns, map roomPlayers to correct slots, fix labels |
| `src/components/ludo/LudoBoard.tsx` | Add `activePlayerIndices` prop, hide inactive home bases and tokens |

### What Does NOT Change

- LudoAI.tsx (single player works fine with 4 players)
- LudoBoard coordinate system and track layout
- WebRTC/durable sync infrastructure
- Settlement, forfeit, ranked logic
- Engine rules (captures, safe squares, home path)

