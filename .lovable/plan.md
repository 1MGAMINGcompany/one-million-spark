

# Fix: False LIVE Labels + No Score/Period Data

## Root Cause

Two separate bugs are creating the symptoms you see:

### Bug 1: False "LIVE" labels
The `live-game-state` edge function marks games as `live` using this logic: `active && !closed && started`. But Polymarket's `active` flag means **the market is open for trading**, NOT that the game is in progress. And `startDate` is often the **market listing time**, not the game kickoff. So any open market with a past listing date gets flagged as "live" — even NHL games that start hours later.

The fallback `getTimeLabel()` in `SimplePredictionCard.tsx` compounds this: it marks anything with `event_date` in the past within 3 hours as "● LIVE" regardless of actual game status.

### Bug 2: No scores, periods, or game time
The Gamma API (`/events?slug=...`) does **not** provide real-time game data (scores, periods, elapsed time). The `gameData` field we check for doesn't exist on Gamma responses. It only has market-level metadata (active/closed/prices). So even when `LiveGameBadge` renders, it has no score/period/elapsed data to display.

The WebSocket (`wss://sports-api.polymarket.com/ws`) is the only source for real-time game state, but it only broadcasts **changes** — if you connect and no score changes happen, you get nothing.

## Fix Plan

### Step 1: Fix the edge function to use Polymarket's Sports REST API

Replace the Gamma API call with Polymarket's **Sports API** (`https://sports-api.polymarket.com/games`), which actually returns real-time game state including scores, periods, clocks, and proper live/ended status. This is the same data source that feeds their WebSocket.

Query by slug or game ID to get:
- `score` (e.g., "3-2")
- `period` / `quarter` / `half`
- `elapsed` / `clock`
- `live` (true boolean — means game is actually in progress)
- `ended` (true boolean)

**File**: `supabase/functions/live-game-state/index.ts`

### Step 2: Fix the false LIVE heuristic in SimplePredictionCard

Change `getTimeLabel()` so it **never** shows "LIVE" on its own. The time heuristic should only show countdown labels ("Starts in 2h", "Today"). Only `LiveGameBadge` (backed by real data from the WS or REST API) should show "LIVE".

When `event_date` is in the past but no live data exists, show nothing (no badge) rather than a false "LIVE".

**File**: `src/components/operator/SimplePredictionCard.tsx`

### Step 3: Fix edge function live detection

Stop using Gamma's `active` flag to determine if a game is live. Instead, only set `live: true` when the Sports API explicitly confirms the game is in progress.

**File**: `supabase/functions/live-game-state/index.ts`

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/live-game-state/index.ts` | Switch from Gamma API to Sports REST API for actual game state data |
| `src/components/operator/SimplePredictionCard.tsx` | Remove false LIVE heuristic from `getTimeLabel()` — only show countdown labels |

## Result
- Games only show "LIVE" when Polymarket confirms they're actually in progress
- Live games display real scores, periods, and elapsed time
- NHL games that haven't started yet show "Starts in Xh" instead of false "LIVE"
- No new API keys needed (Sports API is public)

