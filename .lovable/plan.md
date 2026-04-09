

# Improving Price Refresh Consistency

## What's Happening Now

Your current price refresh involves **three independent timers** racing each other:

1. **Frontend table poll**: re-reads `prediction_fights` every **15 seconds** (FightPredictions.tsx line 365)
2. **Price worker poll**: calls `polymarket-prices` edge function every **45 seconds** (usePolymarketPrices.ts) which writes new prices to the DB
3. **Realtime subscription**: when the DB row changes (from the price worker), Supabase Realtime fires an event that triggers another re-fetch

So when you refresh the page, the price you see depends on *when* the last worker ran. Sometimes you land 2 seconds after a sync (fresh), sometimes 40 seconds after (stale). The inconsistency is structural.

## What Other Platforms Do

Sites like Polymarket, Kalshi, and PredictIt use **WebSocket-pushed prices** — prices stream from the exchange to the client in real-time, no polling. Specifically:

- **Polymarket**: WebSocket at `wss://ws-subscriptions-clob.polymarket.com/ws/market` — prices push on every trade
- **Kalshi**: WebSocket feed for orderbook updates
- **Robinhood/Coinbase**: WebSocket tickers that push every price change

The key difference: **they never poll for prices**. Prices arrive via push, so every user sees the same price at the same time.

## Recommended Fix — Two Phases

### Phase 1: Client-Side WebSocket for Live Prices (Biggest Impact)

Connect directly to Polymarket's public CLOB WebSocket for real-time price streaming. No edge function needed for price display.

**How it works:**
- New hook `usePolymarketLivePrices` subscribes to `wss://ws-subscriptions-clob.polymarket.com/ws/market`
- Subscribes to token IDs for all visible fights
- On each price message, update a local price map (React state/context)
- FightCard components read from the live price map first, falling back to DB prices
- The existing `polymarket-prices` worker continues running (reduced to every 2-3 minutes) as a **persistence layer** for the DB — used by the slippage gate in `prediction-submit`

**Result:** Prices update within ~1 second of any trade on Polymarket. Every user sees the same price simultaneously. No more variable refresh times.

### Phase 2: Optimistic Price Display on Page Load

- On initial page load, immediately show DB-cached prices (current behavior)
- Within 1-2 seconds, WebSocket connects and overwrites with live prices
- Add a subtle "LIVE" dot indicator next to prices once the WebSocket is connected
- If WebSocket fails, fall back to current polling gracefully

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/usePolymarketLivePrices.ts` | **New** — WebSocket connection to Polymarket CLOB, price state management |
| `src/pages/FightPredictions.tsx` | Use live prices from WebSocket, merge with DB prices |
| `src/pages/platform/OperatorApp.tsx` | Same live price integration |
| `src/components/predictions/FightCard.tsx` | Accept optional live price override prop |
| `src/hooks/usePolymarketPrices.ts` | Reduce poll interval from 45s → 120s (DB persistence only) |
| `src/pages/FightPredictions.tsx` | Reduce table poll from 15s → 30s (WebSocket handles freshness) |

## What NOT to Change

- `prediction-submit` slippage logic — still reads DB prices server-side
- `polymarket-prices` edge function — still runs for DB persistence, just less frequently
- Realtime subscription — keep as backup

## Technical Note

Polymarket's public CLOB WebSocket requires no authentication for market data. The subscription message format is:
```json
{"type": "subscribe", "channel": "market", "assets_id": "TOKEN_ID"}
```
Price updates arrive as JSON with `best_bid` / `best_ask` fields. This is the same feed Polymarket.com uses.

