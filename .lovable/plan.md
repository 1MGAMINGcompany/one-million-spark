

# Money's First-Game Tutorial for Ludo AI

## Overview

Replace the current basic `LudoOnboardingOverlay` with a richer, multi-step tutorial featuring Money (the AI monkey assistant) in a speech-cloud bubble that points toward the relevant UI element. Each step has a small "x" close button so users can dismiss at any time. Shows only on the user's very first AI Ludo game (localStorage).

## Tutorial Steps

| Step | Trigger | Message | Points toward |
|------|---------|---------|---------------|
| 1 | Game starts, human turn, `WAITING_ROLL` | "Press here to roll the dice!" | Dice area (bottom) |
| 2 | After rolling, no 6 (no movable tokens) | "You need a 6 to get a piece out! AI's turn now." | Board center |
| 3 | AI is playing | "Now it's AI's turn to play..." | Turn indicator (top) |
| 4 | Human rolls a 6, has movable tokens | "You rolled a 6! Tap the glowing piece to move it." | Board / highlighted tokens |
| 5 | After moving with a 6 (bonus roll) | "Great! Because you rolled a 6, you get to roll again!" | Dice area |
| 6 | Tutorial complete | Auto-dismiss, set localStorage flag |

Steps adapt to what actually happens in the game -- if the user rolls a 6 on their first try, steps 2-3 are skipped.

## Visual Design

- A floating "cloud" speech bubble (white/cream with soft shadow, tail/arrow pointing toward the target area)
- Money's monkey image (from `/images/monkey-idle.png`) displayed at full size inside the cloud (left side)
- Message text on the right side of Money
- Small "x" button in the top-right corner of the cloud
- Subtle entrance animation (scale-in + fade-in)
- No dark backdrop overlay (unlike current implementation) -- just the floating cloud so gameplay stays visible

## Technical Details

### File: `src/components/LudoOnboardingOverlay.tsx` (rewrite)

- Expand from 2 steps to a state machine tracking ~6 contextual steps
- New props needed from `LudoAI.tsx`:
  - `diceValue: number | null` -- to detect if user rolled a 6
  - `phase` (already passed)
  - `isHumanTurn` (already passed)
  - `hasMovableTokens` (already passed)
  - `isGameOver` (already passed)
  - `currentPlayerIsAI: boolean` -- to show "AI is thinking" step
- State machine transitions based on game phase changes
- Each step renders Money's image + message in a positioned cloud
- Cloud position varies per step: bottom-center (for dice), top-center (for turn indicator), mid-center (for board)
- localStorage key remains `ludo-onboarding-done`

### File: `src/pages/LudoAI.tsx` (minor update)

- Pass additional props to `LudoOnboardingOverlay`: `diceValue`, `currentPlayerIsAI`

### No new dependencies, no database changes, no edge functions

