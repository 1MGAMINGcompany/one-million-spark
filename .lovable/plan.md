

# Fix: Live Game Data Not Showing (WebSocket Heartbeat Bug)

## What's Wrong

The Polymarket Sports WebSocket sends **plain text `ping`** frames (not JSON). Our code has two bugs:

1. **Heartbeat response is wrong**: We send `JSON.stringify({ type: "ping" })` on an interval, but the server expects us to **respond** with plain text `"pong"` when we **receive** `"ping"`. We should NOT be initiating pings at all.

2. **The `"ping"` text crashes JSON.parse**: When the server sends `"ping"`, our `onmessage` handler tries `JSON.parse("ping")` which throws, and the empty `catch {}` swallows it silently. We never send `"pong"` back, so the server disconnects us after 10 seconds. Every time.

The connection establishes, immediately starts getting `"ping"` messages every 5s, fails to respond, and gets killed. This cycles forever with backoff, never receiving any actual game data.

## The Fix

**File: `src/hooks/useSportsWebSocket.tsx`**

1. Remove the client-initiated ping interval entirely
2. In `onmessage`, check if `ev.data === "ping"` BEFORE trying `JSON.parse`, and respond with `ws.send("pong")`
3. Parse the JSON message format correctly per Polymarket docs: messages have `gameId`, `slug`, `status`, `score`, `period`, `elapsed`, `leagueAbbreviation`

```typescript
ws.onmessage = (ev) => {
  // Server sends plain text "ping" — respond with "pong"
  if (ev.data === "ping") {
    ws.send("pong");
    return;
  }
  try {
    const data = JSON.parse(ev.data);
    // ... parse game state
  } catch {}
};
```

Also update `parseLiveState` to match the actual Polymarket message fields:
- `score` is a string like `"3-16"` (not separate `score_a`/`score_b`)
- `leagueAbbreviation` gives us the sport (e.g., `"nhl"`, `"nba"`, `"epl"`)
- `status` values: `"InProgress"`, `"Final"`, `"F/OT"`, `"F/SO"`, `"Postponed"`

## Scope
- **1 file edited**: `src/hooks/useSportsWebSocket.tsx`
- No other changes needed — LiveGameBadge and card integrations are already correct
- Will work immediately after publish

