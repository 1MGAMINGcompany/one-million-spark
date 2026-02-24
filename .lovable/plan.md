

# Money's First-Game Tutorial for All AI Games

## Overview

Create onboarding overlays for Chess, Checkers, Backgammon, and Dominos AI games, matching the Ludo tutorial pattern: Money (the AI monkey) appears in a floating speech-cloud bubble guiding first-time players through key game actions. Each overlay uses localStorage to show only once and has an "x" dismiss button.

## New Files (4 components)

### 1. `src/components/ChessOnboardingOverlay.tsx`

**Steps:**
| Step | Trigger | Message | Position |
|------|---------|---------|----------|
| SELECT_PIECE | Game starts, player's turn | "Tap one of your white pieces to see where it can move!" | center |
| MOVE_PIECE | Player selects a piece (valid moves shown) | "Now tap a highlighted square to move there!" | center |
| AI_TURN | AI is thinking | "AI is thinking... watch for its move!" | top |
| YOUR_TURN_AGAIN | AI finished, player's turn again | "Your turn again! Keep it up!" | center |
| DONE | Auto-dismiss after step 4 completes |

**Props from ChessAI.tsx:** `isThinking`, `gameOver`, `moveCount` (moveHistory.length), `isPlayerTurn` (game.turn() === 'w')

**localStorage key:** `chess-onboarding-done`

### 2. `src/components/CheckersOnboardingOverlay.tsx`

**Steps:**
| Step | Trigger | Message | Position |
|------|---------|---------|----------|
| SELECT_PIECE | Game starts, player's turn | "Tap one of your gold pieces to select it!" | center |
| MOVE_PIECE | Piece selected, valid moves highlighted | "Now tap a highlighted square to move!" | center |
| AI_TURN | AI is thinking | "AI is making its move..." | top |
| CAPTURE_TIP | Player's turn, capture is available | "You must capture when possible! Tap the piece that can jump." | center |
| DONE | Auto-dismiss after seeing capture tip or after 2 full turns |

**Props from CheckersAI.tsx:** `currentPlayer`, `isAiThinking`, `gameOver`, `selectedPiece` (boolean), `hasCaptures` (playerHasCaptures result), `moveCount`

**localStorage key:** `checkers-onboarding-done`

### 3. `src/components/BackgammonOnboardingOverlay.tsx`

**Steps:**
| Step | Trigger | Message | Position |
|------|---------|---------|----------|
| ROLL_DICE | Game starts, player's turn, no dice rolled | "Tap 'Roll Dice' to start your turn!" | bottom |
| SELECT_CHECKER | Dice rolled, player needs to select checker | "Tap a highlighted checker to move it!" | center |
| MOVE_TO | Checker selected, valid destinations shown | "Now tap a highlighted point to move there!" | center |
| AI_TURN | AI is playing | "AI is rolling and moving..." | top |
| DONE | Auto-dismiss after player completes first full turn |

**Props from BackgammonAI.tsx:** `currentPlayer`, `isThinking`, `gameOver`, `dice` (length), `selectedPoint` (boolean), `remainingMoves` (length)

**localStorage key:** `backgammon-onboarding-done`

### 4. `src/components/DominosOnboardingOverlay.tsx`

**Steps:**
| Step | Trigger | Message | Position |
|------|---------|---------|----------|
| PLAY_TILE | Game starts, player's turn, board empty | "Tap a tile from your hand to play it!" | bottom |
| MATCH_ENDS | After first tile placed, player's turn | "Match a tile to either end of the chain!" | center |
| DRAW_TIP | Player has no legal moves | "No matching tiles? Draw from the boneyard!" | bottom |
| AI_TURN | AI is thinking | "AI is choosing a tile..." | top |
| DONE | Auto-dismiss after 2 player turns |

**Props from DominosAI.tsx:** `isPlayerTurn`, `isThinking`, `gameOver`, `chainLength`, `hasLegalMoves` (canPlayerPlay), `boneyardCount`, `playerTurnCount`

**localStorage key:** `dominos-onboarding-done`

## Modified Files (4 pages)

Each AI page gets the same treatment as LudoAI:
1. Import the new onboarding overlay component
2. Add it to the JSX (right after `<ProactiveGameTip>`)
3. Pass the required props from existing game state

### `src/pages/ChessAI.tsx`
- Add `<ChessOnboardingOverlay>` with props derived from existing `game`, `isThinking`, `gameOver`, `moveHistory`

### `src/pages/CheckersAI.tsx`
- Track a `moveCount` state (increment on each player move)
- Add `<CheckersOnboardingOverlay>` with props from `currentPlayer`, `isAiThinking`, `gameOver`, `selectedPiece`, `playerHasCaptures`

### `src/pages/BackgammonAI.tsx`
- Add `<BackgammonOnboardingOverlay>` with props from `currentPlayer`, `isThinking`, `gameOver`, `dice`, `selectedPoint`, `remainingMoves`

### `src/pages/DominosAI.tsx`
- Track a `playerTurnCount` state (increment when player completes a move)
- Add `<DominosOnboardingOverlay>` with props from `isPlayerTurn`, `isThinking`, `gameOver`, `chain.length`, `canPlayerPlay`, `boneyard.length`

## Design

All overlays share the same visual treatment as the Ludo overlay:
- Floating cream/amber speech cloud with soft shadow
- Money's monkey image (`/images/monkey-idle.png`) on the left
- Message text on the right
- Small "x" close button (top-right corner)
- CSS arrow pointing toward the relevant area (up/down/none)
- `animate-in fade-in zoom-in-95` entrance animation
- No dark backdrop - just the floating cloud
- `pointer-events-none` on the container, `pointer-events-auto` on the bubble

## No other changes needed
- No database changes
- No edge function changes
- No new dependencies
