

# Fix Arabic RTL Flipping Game Boards

## Problem

When Arabic is selected, `document.documentElement.dir = 'rtl'` is set on the `<html>` element. CSS grid and flexbox inherit this direction, causing **all game boards** (Chess, Checkers, Backgammon, Dominos, Ludo) to render mirrored/flipped. The boards should always render left-to-right regardless of language.

## Root Cause

The RTL direction propagates to game board grids (`grid-cols-8`, flex containers, absolute positioning) making them render right-to-left. Only **text content** (labels, UI, menus) should follow RTL.

## Solution

Add `dir="ltr"` to each game board's outermost container element. This overrides the document-level RTL for the board rendering while allowing all surrounding text/UI to remain RTL.

## Files to Change

| File | Change |
|---|---|
| `src/components/ChessBoardPremium.tsx` | Add `dir="ltr"` to the board wrapper div |
| `src/components/ChessBoard.tsx` | Add `dir="ltr"` to the grid container |
| `src/pages/CheckersAI.tsx` | Add `dir="ltr"` to the 8x8 grid board div |
| `src/pages/BackgammonAI.tsx` | Add `dir="ltr"` to the board container |
| `src/pages/BackgammonGame.tsx` | Add `dir="ltr"` to the board container |
| `src/pages/DominosAI.tsx` | Add `dir="ltr"` to the domino play area |
| `src/pages/DominosGame.tsx` | Add `dir="ltr"` to the domino play area |
| `src/pages/LudoAI.tsx` | Add `dir="ltr"` to the Ludo board grid |
| `src/pages/LudoGame.tsx` | Add `dir="ltr"` to the Ludo board grid |
| `src/pages/CheckersGame.tsx` | Add `dir="ltr"` to the checkers board grid |
| `src/components/ludo/LudoBoard.tsx` | Add `dir="ltr"` to the board component if it has its own grid |

Each change is a single attribute addition — no logic changes needed. Text labels, turn indicators, and UI chrome surrounding the boards will continue to respect RTL normally.

