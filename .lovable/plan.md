

## Plan: 10x UX Overhaul — Prediction Cards, Modal, Live Scores, Market Signals

### Summary
Redesign the prediction cards and modal for conversion-optimized UX: $5 minimum, prominent payout display, live score/period/time on cards, market split bars, urgency signals, and multiplier-first pick buttons. Fix the live-game-state edge function to extract scores from Gamma's `events[0]` array. Improve order error transparency.

---

### PART 1 — Fix live scores from Gamma (root cause)

**File: `supabase/functions/live-game-state/index.ts`**
- In `parseGammaMarket()`, extract `score`, `period`, `elapsed` from `market.events[0]` which contains actual game data (confirmed: Gamma returns `events[0].score = "0-1"`, `events[0].period = "P3"`, `events[0].elapsed = "04:53"`)
- Parse `score` into `scoreA`/`scoreB`
- Return these fields alongside `realSlug`, `status`, `live`, `ended`

### PART 2 — Redesign prediction cards (`SimplePredictionCard.tsx`)

**Pick buttons — multiplier-first design:**
- Replace `Predict $10 → Return $21.74` with:
  - Team name (bold)
  - `2.17x` (large, primary color)
  - `+117%` (small, green)
- Remove the `$10` reference amount

**Live score display on cards:**
- Between team names, when live: show score large (`0 - 1`), and below it period+time (`P3 • 04:53`)
- When not live but starting soon (<15min): show `⏳ Starts in 12m` in red

**Market split bar:**
- Below pick buttons, show a horizontal bar: `██████░░░░ 60% TeamA` based on `priceA`/`priceB`
- Creates social proof and faster decisions

**Urgency/volume signals:**
- For live games: show `🔥 Hot market` badge
- For upcoming <15min: make time label red

### PART 3 — Redesign prediction modal (`PredictionModal.tsx` + `TradeTicket.tsx`)

**Modal header — show live game context:**
- Sport icon + "Rangers vs Stars"
- If live: `🔴 LIVE — P3 • 04:53` + `Score: 0 - 1`
- Pass fight's live state into modal

**User pick section:**
- "Your Pick: Rangers"
- "Odds: 12.25x" + "Win Chance: 8.1%"

**Amount input:**
- Change `MIN_USD` from `1.0` to `5.0` in both `PredictionModal.tsx` and `TradeTicket.tsx`
- Default amount = `"5"` instead of `""`
- Quick buttons: `[5, 10, 25, 50]` (already correct)

**Big payout box:**
- Large prominent display: `💰 You Win $60.12`
- Subtitle: `$4.90 × 12.25`

**Button text:**
- Change from "Submit Prediction" to `Place Prediction ($X)`

### PART 4 — Better order error messages (`clobOrderClient.ts`)

- When SDK returns a response without `orderID`, extract `resp?.errorMsg`, `resp?.error`, `resp?.message`, `resp?.status` and include in the error
- Log full response object for debugging
- Surface specific errors like minimum order size violations

### PART 5 — Live badge enhancement (`LiveGameBadge.tsx`)

- Already handles score/period/elapsed well — just needs the data from Part 1
- No structural changes needed, just verify it renders correctly with new data

---

### Files Changed
1. `supabase/functions/live-game-state/index.ts` — extract score/period/elapsed from `events[0]`
2. `src/components/operator/SimplePredictionCard.tsx` — multiplier buttons, market split bar, urgency, live score layout
3. `src/components/predictions/PredictionModal.tsx` — live context header, $5 min, big payout, pick summary
4. `src/components/predictions/TradeTicket.tsx` — $5 min, default amount, button text, payout box
5. `src/lib/clobOrderClient.ts` — extract SDK rejection reason from response

### What Stays Unchanged
- Order submission architecture (SDK + timeout)
- WebSocket connection and slug matching
- Fee calculation logic
- Credential derivation flow
- All backend edge functions except `live-game-state`

