

# Streamline Money AI Helper for Retention

## Overview

Five targeted changes to reduce friction, teach new users how to play, and bring them back to abandoned games. Based on analytics showing 96% drop-off between welcome popup and actual message sent.

## Changes

### 1. Remove Welcome Gate -- Tap Bubble = Instant Chat

**Problem**: First-time visitors see "Do you want help?" with Yes/No buttons. 50%+ drop off at this step.

**Solution**: Remove the `showFirstTimeWelcome` flow entirely. When the bubble is tapped (or auto-opened for first-timers), go straight to either the assist menu (non-AI routes) or the skill picker (AI routes). No "Do you want me to help you?" question.

- Remove the `welcomeAccepted` state and the `showFirstTimeWelcome` conditional block (lines 624-645)
- Update flow logic so `showAssistMenu` no longer depends on `welcomeAccepted`
- Keep the first-visit auto-open behavior (1.5s delay) but skip the welcome gate
- Remove `welcomeGreeting`, `welcomeYes`, `welcomeNo` from all 10 language dictionaries (cleanup)

### 2. Proactive Context Tip on First AI Game Visit

**Problem**: Users land on AI game pages and don't know what to do. No guidance unless they open the helper.

**Solution**: Add a floating toast-style tip that auto-appears 2 seconds after landing on any `/play-ai/*` route for the first time per game type. Disappears after 5 seconds. No interaction required.

- Add a new component section rendered outside the bubble/panel -- a small pill overlay near the bottom of the screen
- Game-specific tips stored in a simple map:
  - chess: "Tap a piece to see where it can move"
  - ludo: "Tap the dice to roll, then tap a piece to move"
  - checkers: "Tap a piece, then tap where to jump"
  - backgammon: "Tap the dice to roll, then tap a checker to move"
  - dominos: "Tap a tile from your hand to play it"
- Persist shown tips in localStorage (`aihelper-tip-shown-{game}`) so each tip shows only once ever
- Animate in from bottom, auto-dismiss after 5 seconds, tap to dismiss early

### 3. Simplify Quick Menu to 3 Options

**Problem**: 6-button grid is overwhelming on mobile. Analytics show only 10 users used quick actions.

**Solution**: Reduce `WELCOME_ACTIONS` from 6 to 3:
- "How to play" (rules -- highest intent)
- "Strategy tip" (most relevant for retention)
- "How does it work?" (catch-all)

Remove: `qWallet`, `qPlayFriends`, `qPlayAI` (these are navigation questions users can type).

For AI routes, reduce quick chips from 4 to 2:
- "How to play" (`chipRules`)
- "Suggest a move" (`chipSuggest`)

Remove: `chipImprove`, `chipWrong` (too similar, rarely used).

### 4. First-Game Ludo Onboarding Arrows

**Problem**: Ludo has 75% abandonment. Users don't know the basic flow: roll dice, then tap a piece.

**Solution**: Add a lightweight onboarding overlay to `LudoAI.tsx` that shows on the user's very first Ludo AI game:

- Step 1: Arrow pointing at dice with label "Roll the dice" -- appears when phase is `WAITING_ROLL` and it's the human's first turn
- Step 2: After rolling, arrow pointing at a movable token with label "Tap a piece to move it"
- After step 2 completes, mark onboarding done in localStorage (`ludo-onboarding-done`)
- Simple CSS-only arrows (no complex animation library needed)
- Semi-transparent backdrop behind arrows to draw focus

### 5. Session Continuity -- Return to Abandoned AI Game

**Problem**: Users leave mid-game and return to the home page with no way back.

**Solution**: Save the current AI game route in localStorage when entering an AI game page. On app load at `/`, check if there's an unfinished game and show a small banner: "You have an unfinished game. Continue?" with Resume/Dismiss buttons.

- In each AI game page (or via a shared hook), write `localStorage.setItem("active-ai-game", "/play-ai/ludo?difficulty=medium")` on mount, and remove it on game over or reset
- In `Home.tsx`, read `active-ai-game` from localStorage on mount. If present, show a banner at top with a "Continue" link and a dismiss button
- Dismiss clears the localStorage key
- Simple, no database changes needed

## Technical Details

### Files Modified

| File | Changes |
|------|---------|
| `src/components/AIAgentHelperOverlay.tsx` | Remove welcome gate flow. Add proactive tip overlay. Reduce quick menu to 3 items. Reduce AI chips to 2. |
| `src/pages/LudoAI.tsx` | Add first-game onboarding overlay with step arrows |
| `src/pages/Home.tsx` | Add session continuity banner for abandoned AI games |
| `src/pages/ChessAI.tsx` | Add `active-ai-game` localStorage write/clear |
| `src/pages/BackgammonAI.tsx` | Add `active-ai-game` localStorage write/clear |
| `src/pages/CheckersAI.tsx` | Add `active-ai-game` localStorage write/clear |
| `src/pages/DominosAI.tsx` | Add `active-ai-game` localStorage write/clear |

### No New Dependencies

All changes use existing React primitives, CSS animations, and localStorage. No new packages needed.

### What Does NOT Change

- No multiplayer logic changes
- No backend/database changes
- No edge function changes
- No settlement or wallet logic changes
- Money bubble drag/position mechanics unchanged
- Streaming chat system unchanged

