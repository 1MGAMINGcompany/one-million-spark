

# Show Live Game Data (Scores, Periods, Clock) + Keep Games Visible Until End

## Problem

1. **No live scores/periods on cards** — The `LiveGameBadge` and `LiveScoreDisplay` components exist and work, but they only appear on the "open for predictions" card variant. The "user already picked" card and the "featured event hero" show no live data at all.

2. **Games disappear too early** — The client-side filter uses a 3-hour grace window (`recentlyStarted`), but a game that started 4+ hours ago and is still live (e.g., an NHL overtime game) gets filtered out. The filter should keep any game visible as long as its `status` is `live` or `open`.

3. **Featured hero has no live score** — The featured event hero block (line 647-697) shows a static "● LIVE" badge but no score, period, or clock data.

4. **REST poll only updates missing slugs** — In `useSportsWebSocket.tsx` line 156, REST poll results are skipped if the slug already exists in state (`if (!next.has(slug))`). This means stale WS data is never refreshed by REST, and if WS misses updates, scores freeze.

## Changes

### 1. SimplePredictionCard.tsx — Add live data to "user picked" card

The "user picked" return block (lines 180-217) currently shows static "VS" between names with no live badge. Add:
- `LiveGameBadge` next to the sport/league label (same as the open card)
- Replace static "VS" with `LiveScoreDisplay` when live (same pattern as the open card)

### 2. OperatorApp.tsx — Featured hero: show live score + period

In the featured event hero (lines 647-697):
- Import and use `useLiveGameState` with the featured event's `polymarket_slug`
- Replace the static "● LIVE" badge with `<LiveGameBadge>` component for consistent period/clock display
- Replace the static "VS" text with `<LiveScoreDisplay>` when live score data is available
- Show period/elapsed info below the score

### 3. OperatorApp.tsx — Fix filter to keep games visible until ended

In the client-side filter (lines 138-166), change the logic:
- Current: `!isLive && !recentlyStarted` removes the event
- New: Also check `f.status === "open"` or `f.status === "locked"` — any fight with an active status stays visible regardless of start time. Only hide if `event_date` is past AND status is not `open`/`live`/`locked`.

This ensures a game that started 5 hours ago but is still `open` for in-play trading remains visible.

### 4. useSportsWebSocket.tsx — REST poll should update existing entries

Line 156: Change `if (!next.has(slug))` to always update, so REST data refreshes stale WS state every 60 seconds. This ensures scores stay current even if WebSocket drops messages.

### 5. REST poll interval — reduce from 60s to 30s for live games

Change `REST_POLL_INTERVAL` from 60,000 to 30,000ms for more responsive score updates as a fallback to WS.

## Files to Change

| File | Change |
|---|---|
| `src/components/operator/SimplePredictionCard.tsx` | Add LiveGameBadge + LiveScoreDisplay to "user picked" card variant |
| `src/pages/platform/OperatorApp.tsx` | Featured hero: show live score/period via LiveGameBadge + LiveScoreDisplay; fix event filter to keep active-status games visible |
| `src/hooks/useSportsWebSocket.tsx` | REST poll: always update (not skip existing); reduce interval to 30s |

## What NOT to Touch

- Translation files
- `live-game-state/index.ts` edge function
- Theme system
- `prediction-submit` edge function (in-play trading already works)
- Auth/Privy integration

