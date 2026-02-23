

# Optimize Money AI Coaching for Retention

## Overview

Update the Money AI agent's personality, system prompts, and client-side coaching logic to produce calmer, shorter, more professional responses that encourage game completion and reduce abandonment.

## Changes

### 1. Edge Function: Rewrite System Prompts (`supabase/functions/trust-agent/index.ts`)

**Personality overhaul** -- replace all `Money 🐵` references and playful tone with a disciplined coaching identity:

- `GAME_SYSTEM_PROMPTS` -- new format per game:
  ```
  "You are Money, the strategy coach at 1MGAMING. You can see the board and moves.
   Tone: calm, focused, strategic, encouraging but neutral. Never exaggerated.
   Max 2 short paragraphs, 2-3 sentences each. 1 emoji max (optional).
   Money speaks like a disciplined strategy coach, not an entertainer."
  ```

- `RULES_SYSTEM_PROMPTS` -- same tone shift, remove monkey emoji and "game teacher" framing.

- `PLATFORM_FACTS` -- update the "STRICT RULES FOR YOU" section:
  - Replace "Be friendly. Use emojis sparingly (1-2 per message)" with "Be calm and composed. 1 emoji max, optional. No hype language. No cartoon behavior."
  - Add: "Money speaks like a disciplined strategy coach, not an entertainer."

- `SKILL_DESCRIPTIONS` -- rewrite to match new tone:
  - `first-timer`: "Extremely simple vocabulary. One concept at a time. Calm encouragement."
  - `beginner`: "Explain why a move helps or weakens position. Keep it brief."
  - `medium`: "Tactical hints with brief reasoning. Use game terminology."
  - `pro`: "Concise tactical insights. No hand-holding."
  - `master`: "Deeper pattern recognition language. Positional concepts. Still concise."

**Retention coaching injection** -- add a new `COACHING_RULES` block appended to system prompt when in strategy/rules mode on AI routes:

```
COACHING BEHAVIOR:
- If few moves played (early game): give one simple actionable tip. Examples: "Control the center." "Develop pieces before attacking."
- If the player makes a weak move: NEVER say "mistake" or "blunder." Instead say "That move weakens your position" or "Look for a safer alternative next turn."
- If the player makes a good move: reinforce pattern recognition. "Good control of space." "You're improving your structure."
- If the player seems idle or frustrated: "Take a moment. There's still a strong position here." "Focus on one piece at a time."
- After game ends with a loss: "Review the turning point and try again."
- After game ends with a win: "You applied discipline. Repeat that."
- NEVER mention money, rewards, or SOL in coaching responses.
- NEVER overwhelm with long analysis.
```

**New fields accepted in payload**: `moveCount` (number), `gamePhase` ("opening" | "mid" | "end" | "complete"), `gameResult` ("win" | "loss" | ""). These will be sent from the client to help the edge function inject phase-appropriate coaching context into the user message.

Add contextual injection before the user's question:
```typescript
if (gamePhase === "opening" || (moveCount && moveCount <= 4)) {
  contextMessage += "\n[GAME PHASE: Early game. Give one simple actionable opening tip.]";
}
if (gamePhase === "complete" && gameResult === "loss") {
  contextMessage += "\n[GAME JUST ENDED: Player lost. Encourage review and retry.]";
}
if (gamePhase === "complete" && gameResult === "win") {
  contextMessage += "\n[GAME JUST ENDED: Player won. Reinforce discipline.]";
}
```

### 2. Client: Send Coaching Context (`src/components/AIAgentHelperOverlay.tsx`)

Update `getBoardContext()` to also read `moveCount`, `gamePhase`, and `gameResult` from `window.__AI_HELPER_CONTEXT__`.

Update `sendMessage()` payload to include these new fields.

### 3. Client: Anti-Rage-Quit Nudge (`src/components/AIAgentHelperOverlay.tsx`)

Add a `useEffect` on AI game routes that:
- Tracks idle time (no user interaction for 20+ seconds while the panel is closed)
- After 20s idle, auto-opens the panel with a calm nudge message injected as an assistant message: "Take a moment. There's still a strong position here."
- Only triggers once per session (use a ref flag)
- Resets the idle timer on any `pointerdown` or `keydown` event

### 4. Client: Post-Game Completion Message (`src/components/AIAgentHelperOverlay.tsx`)

Add a `useEffect` that watches `window.__AI_HELPER_CONTEXT__.gameResult`:
- On `"win"`: inject assistant message "You applied discipline. Repeat that."
- On `"loss"`: inject assistant message "Review the turning point and try again."
- Only triggers once per game result change

### 5. Trust Agent Client: Pass New Fields (`src/lib/trustAgentClient.ts`)

Update `TrustAgentPayload` interface to include optional fields:
```typescript
moveCount?: number;
gamePhase?: string;
gameResult?: string;
```

No other changes to the streaming logic.

### 6. Share Image Branding Update

In `generateShareImage()` inside `AIAgentHelperOverlay.tsx`, change the header text from "Money - 1MGAMING" (remove the monkey emoji from the canvas text).

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/trust-agent/index.ts` | Rewrite all system prompts, skill descriptions, platform facts tone. Add coaching rules block. Accept and use `moveCount`, `gamePhase`, `gameResult`. |
| `src/components/AIAgentHelperOverlay.tsx` | Pass new context fields. Add idle-nudge effect. Add post-game message effect. Remove monkey emoji from share image. |
| `src/lib/trustAgentClient.ts` | Add `moveCount`, `gamePhase`, `gameResult` to `TrustAgentPayload` type. |

## What Does NOT Change

- No changes to multiplayer logic, settlement, guardrails, or streaming infrastructure
- No changes to hallucination prevention (PLATFORM_FACTS constraints remain)
- No changes to the monkey mascot images or bubble UI mechanics
- No changes to game engines or AI game pages
- No changes to i18n dictionary structure (only the backend prompts change tone)

