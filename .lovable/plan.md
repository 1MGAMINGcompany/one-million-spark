

## Plan: Production-Ready Event Cards + Live Score Fix + Betting Safeguards

### Root Cause: Why Live Scores Stopped Working

**Confirmed via direct testing**: The `live-game-state` edge function fetches from `https://gamma-api.polymarket.com/markets/{id}`, but **Gamma's market endpoint does NOT return live scores**. It returns market metadata (active/closed/resolved) only. The `events[0]` parsing code exists but the response simply has no `events` array with score/period/elapsed data.

The edge function returns this for a currently-live NHL game (Panthers vs Maple Leafs, market ID 1598538):
```json
{ "live": true, "status": "InProgress", "realSlug": "nhl-fla-tor-2026-04-11" }
```
No score, no period, no elapsed — because Gamma doesn't provide them on the market endpoint.

**The only source for live scores is the Sports WebSocket** (`wss://sports-api.polymarket.com/ws`). The WebSocket IS connected, but its messages use Polymarket's own slug format which may not match our internal shorthand slugs. The reverse slug map was meant to fix this, but since Gamma returns the same slug we already have (`realSlug = internalSlug`), the reverse map adds no new mappings.

**Fix**: Use Polymarket's Sports REST API (`https://sports-api.polymarket.com/games`) as the snapshot source instead of the Gamma market endpoint. This is the actual sports data API that returns scores, periods, and clocks.

---

### Implementation

#### PART 1 — Fix live-game-state to use Sports API (the real fix)

**File: `supabase/functions/live-game-state/index.ts`**

Replace the Gamma market fetch with a call to the Sports API. For each tracked market, we need to:
1. First resolve the market's event slug from Gamma (already working)
2. Then fetch live game data from `https://sports-api.polymarket.com/games?slug={eventSlug}` or use the bulk games endpoint
3. Parse score, period, elapsed, sport from the Sports API response

Alternatively, fetch the bulk active games list from `https://sports-api.polymarket.com/games/active` and match by slug/event. Add diagnostic logging so we can see exactly what the Sports API returns.

#### PART 2 — Card UX redesign (`SimplePredictionCard.tsx`)

Reorder card hierarchy to:
1. **Top row**: League label + LIVE badge (with pulse animation) or countdown badge
2. **Score block** (when live): Large centered score `Panthers 2 — 1 Maple Leafs` with period/clock below
3. **Teams row**: Logo + name on each side with VS separator (hidden when score shown)
4. **Start time** (when not live): Localized date + countdown badge
5. **Odds boxes**: Team name + multiplier + implied probability (`Implied: 67%`)
6. **Market split bar** + total pool

Add:
- Pulse animation on LIVE badge (`animate-pulse`)
- Subtle glow border on live cards (`box-shadow` or `ring`)
- Green/red score change indicator dot
- Countdown badges: "Starts in 12m", "Starts in 2h", "Tomorrow"
- Implied probability line under each odds multiplier

#### PART 3 — Modal improvements (`PredictionModal.tsx`)

- Show live score + period in modal header when available
- Enforce $5 minimum (already done, verify)
- Show "Min: $5" label clearly
- Block submit below minimum

#### PART 4 — Minimum bet enforcement (`TradeTicket.tsx`)

- Quick chips already filter by `minUsd` (line 51) — verify this works
- Add visible "Min: $5" label near amount input
- Disable submit button with clear message when below minimum

#### PART 5 — Mobile optimization

- Score visible without scrolling (move above odds)
- Teams stack vertically on mobile
- Odds boxes full width on mobile
- No horizontal overflow
- Thumb-friendly button targets

#### PART 6 — i18n

Add translation keys for all new strings:
- `operator.implied` ("Implied")
- `operator.startsIn` variations
- `operator.tomorrow`
- `operator.min` ("Min")
- `operator.liveScore`
- Update existing keys as needed

All 10 locale files updated.

---

### Files Changed

1. `supabase/functions/live-game-state/index.ts` — Switch from Gamma markets to Sports API for live scores
2. `src/components/operator/SimplePredictionCard.tsx` — Full card redesign with score prominence, implied odds, pulse animation, countdown
3. `src/components/predictions/PredictionModal.tsx` — Live context in header, min label
4. `src/components/predictions/TradeTicket.tsx` — Min label, validation messaging
5. `src/components/predictions/LiveGameBadge.tsx` — Pulse animation enhancement
6. `src/i18n/locales/*.json` (10 files) — New translation keys

### What Stays Unchanged
- Trading backend, SDK calls, fee collection, credential flow
- WebSocket connection logic
- OperatorApp.tsx data fetching and slug mapping
- All edge functions except `live-game-state`

