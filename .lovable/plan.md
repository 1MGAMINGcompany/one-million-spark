

# Fix: Live Game Data Display on Operator App

## What's Actually Happening

The Polymarket Sports WebSocket (`wss://sports-api.polymarket.com/ws`) is **real and officially documented**. Our implementation is close but has gaps that prevent data from showing:

1. **No initial snapshot**: The WS only broadcasts on state changes (score change, period change, game end). If you connect mid-game and nothing changes for 30 seconds, you see nothing.
2. **Missing status values**: Polymarket sends `live` and `ended` as **boolean fields** directly in the payload. Our parser redundantly re-derives these from status strings and misses sport-specific statuses like `"running"` (esports), `"inprogress"` (tennis), `"Break"` (soccer halftime).
3. **No REST fallback for current state**: We need to fetch current game state on page load, then use the WS for real-time updates.

## The Fix (3 steps)

### Step 1: Add REST polling for initial state via Gamma API

Create an edge function `live-game-state` that:
- Accepts a list of `polymarket_slug` values
- For each slug, fetches current game state from Polymarket's Gamma API (`https://gamma-api.polymarket.com/events?slug={slug}`)
- Returns current scores, periods, and status
- Caches results for 30 seconds to avoid rate limits
- Called once on page load and every 60 seconds as a fallback

### Step 2: Update `useSportsWebSocket.tsx`

- On mount, call the `live-game-state` edge function with all visible slugs to get **initial state**
- Continue using the WebSocket for real-time updates (our ping/pong implementation is correct per docs)
- Use Polymarket's native `live` and `ended` boolean fields directly from the payload instead of re-deriving them
- Add missing status values: `"running"`, `"inprogress"`, `"Break"`, `"PenaltyShootout"`, `"Awarded"`
- Accept a `slugs` prop in the provider so cards can register which slugs need tracking

### Step 3: Update `LiveGameBadge.tsx` formatting

- Add `"Break"` status → show "HT" (halftime) for soccer
- Add esports period formatting (`1/3`, `2/3` → "Map 1", "Map 2")
- Handle tennis `"inprogress"` status

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/live-game-state/index.ts` | **New** — REST proxy to fetch current game state from Gamma API |
| `src/hooks/useSportsWebSocket.tsx` | Update parser, add REST polling for initial state, accept slugs |
| `src/components/predictions/LiveGameBadge.tsx` | Add Break/halftime formatting, esports maps |
| `src/components/operator/SimplePredictionCard.tsx` | Pass slug list to provider for tracking |
| `src/pages/platform/OperatorApp.tsx` | Pass visible fight slugs to the provider |
| `supabase/config.toml` | Add `live-game-state` function config |

## Technical Detail

The Gamma API provides event metadata including game state. For each fight with a `polymarket_slug`, we can query:
```
GET https://gamma-api.polymarket.com/events?slug={slug}
```

This gives us the current state snapshot. The WebSocket then layers real-time updates on top. This two-tier approach ensures:
- **Immediate data on page load** (REST)
- **Real-time updates** (WebSocket)
- **Graceful fallback** if the WS disconnects (REST polls every 60s)

## No API keys needed
Both the Gamma API and Sports WebSocket are public / no auth required.

