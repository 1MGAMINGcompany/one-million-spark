

# Make Hard Mode Expert-Level Across All AI Games

## Current State (per game)

| Game | Hard Mode AI | Weakness |
|---|---|---|
| **Chess** | Minimax depth 4, 0 randomness, piece-square tables | Depth 4 is ~beginner/intermediate. No endgame tables, no quiescence search. Easily beatable. |
| **Checkers** | 1-ply lookahead (evaluates immediate move only), 0 randomness | No tree search at all. Just picks the best immediate board score. Trivially beatable. |
| **Backgammon** | Negamax depth 4, 0 randomness, 3s time limit | Decent but evaluation function quality is key. Could go deeper. |
| **Dominos** | Greedy heuristic (play highest pip count + numbers you hold many of) | No lookahead whatsoever. Just a scoring heuristic on the current move. |
| **Ludo** | Priority-based (finish > capture > advance furthest > leave base) | No lookahead, no opponent awareness, no safety evaluation. |

## Plan

### 1. Chess — Increase depth + add quiescence search
**File:** `src/lib/chessEngine/localChessAI.ts`
- Increase hard depth from **4 to 5**
- Add **quiescence search** (extend search on captures/checks at leaf nodes to avoid horizon effect — this is the single biggest improvement for chess AI quality)
- Add **king safety bonus** to evaluation (penalize exposed king, bonus for castled king)
- Add **endgame king table** (switch king PST when few pieces remain to encourage centralization)
- These changes make the AI play at roughly a **1400-1600 Elo** level, which feels expert to casual players

### 2. Checkers — Add minimax with alpha-beta pruning
**File:** `src/pages/CheckersAI.tsx`
- Replace the current 1-ply evaluation with proper **minimax + alpha-beta** at depth **6** for hard mode
- Improve evaluation: add **center control bonus**, **back row bonus** (protecting home row), **mobility score**, and increase king value from 3 to 5
- Add move ordering (captures first) for better pruning
- This transforms checkers from trivially beatable to genuinely challenging

### 3. Backgammon — Increase depth + improve evaluation
**File:** `src/engine/backgammon/ai.ts`
- Increase hard depth from **4 to 5**, increase time limit from **3s to 5s**
- The evaluation function in the engine likely needs improvements (blot penalty, prime detection, race evaluation) — will check and enhance `engine.ts` `evaluateState`

### 4. Dominos — Add lookahead search
**File:** `src/pages/DominosAI.tsx`
- Add a **minimax-style 3-ply lookahead** for hard mode that simulates future plays
- Improve scoring: penalize leaving the opponent with plays for numbers you can't match, bonus for emptying hand faster
- Add **blocking strategy**: prefer plays that leave chain ends matching numbers you hold but opponent likely doesn't

### 5. Ludo — Add opponent awareness + safety scoring
**File:** `src/lib/ludo/ai.ts`
- Add **safety evaluation**: avoid landing on positions where opponents can capture you
- Add **blocking strategy**: prefer moves that land near opponent tokens (threatening capture)
- Add **spread vs. concentrate** logic: keep tokens spread to maximize dice utility
- Reorder priorities: safety-aware capture > finish > strategic advance > leave base
- Score all moves and pick the best instead of first-match priority

## Summary of Changes

| File | Change |
|---|---|
| `src/lib/chessEngine/localChessAI.ts` | Depth 4→5, add quiescence search, king safety, endgame king table |
| `src/pages/CheckersAI.tsx` | Add minimax alpha-beta at depth 6, improved evaluation |
| `src/engine/backgammon/ai.ts` | Depth 4→5, time 3s→5s |
| `src/engine/backgammon/engine.ts` | Improve `evaluateState` (blot penalty, prime bonus) |
| `src/pages/DominosAI.tsx` | Add 3-ply lookahead for hard mode |
| `src/lib/ludo/ai.ts` | Score-based move selection with safety + blocking |

All changes are isolated to hard mode — easy and medium remain unchanged.

