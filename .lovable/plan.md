

# Add Live Game Status (Score, Period, Time) to Prediction Cards

## What we are building

Real-time score, period, and elapsed time on all live prediction cards — matching the Polymarket experience you showed (e.g., "LIVE P2 - 01:16  4-1"). Works for NHL, NBA, MLB, Soccer, Tennis, Cricket, and Esports.

## Data source

Polymarket provides a free Sports WebSocket at `wss://sports-api.polymarket.com/ws` that broadcasts live game data (score, period, elapsed, status) keyed by slug. No auth required. Our `polymarket_slug` field already stored on every fight maps directly to this data.

## Architecture

```text
Polymarket Sports WS  →  useSportsWebSocket (React context)  →  Cards lookup by slug
```

Single shared WebSocket connection, auto-reconnect with backoff, ping/pong keepalive.

## Implementation steps

### 1. New file: `src/hooks/useSportsWebSocket.tsx`
- React context + provider wrapping a single WebSocket to `wss://sports-api.polymarket.com/ws`
- Maintains a `Map<slug, LiveGameState>` with: `score`, `period`, `elapsed`, `status`, `live`, `ended`
- Handles server ping/pong heartbeat (5s interval)
- Auto-reconnects with exponential backoff
- Exposes `useLiveGameState(slug)` hook for cards

### 2. New file: `src/components/predictions/LiveGameBadge.tsx`
- Sport-aware formatting:
  - NHL: "● LIVE P2 - 01:16  4-1"
  - NBA: "● LIVE Q4  98-102"
  - Soccer: "● LIVE 2H - 67'  2-0"
  - MLB: "● LIVE Bot 5  3-2"
  - Tennis: "● LIVE Set 2  6-4, 3-2"
  - Cricket: "● LIVE 2nd Inn  142/3"
- Pulsing red dot for in-progress, green check for Final
- Accepts theme prop for operator styling

### 3. Edit: `src/components/predictions/FightCard.tsx`
- Add `polymarket_slug` to the `Fight` interface
- Import `useLiveGameState` from the WebSocket context
- When live data exists for this slug, render `LiveGameBadge` instead of static "LIVE" label
- Show score next to team names when available
- Fall back to current time-based detection when no WS data

### 4. Edit: `src/components/operator/SimplePredictionCard.tsx`
- Import `useLiveGameState`
- Replace the generic `getTimeLabel` "● LIVE" span with `LiveGameBadge` when WS data is available
- Display live score between team names
- Fall back gracefully to current behavior

### 5. Edit: `src/pages/platform/OperatorApp.tsx` + prediction page wrappers
- Wrap content with `SportsWebSocketProvider`
- Provider auto-connects only when mounted, disconnects on unmount

## Scope
- **3 new files** (hook/context, badge component)
- **3 edited files** (SimplePredictionCard, FightCard, OperatorApp wrapper)
- No database changes
- No edge function changes
- No API keys needed
- Graceful fallback: if WebSocket is unavailable, cards show current time-based LIVE label

