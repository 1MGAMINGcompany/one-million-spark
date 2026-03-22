
Audit result

- I checked the current worker, the UI logic, the stored MMA fights, and live Polymarket endpoints.
- There are two separate problems:

1. Wrong backend price source for display odds
- The worker currently uses `https://clob.polymarket.com/price?token_id=...&side=BUY`.
- Per Polymarket docs, that endpoint returns the best bid for `BUY`, not the market’s fair/display probability.
- For many MMA markets this produces distorted values like `0.999 / 0` or `1 / 0`, especially when the book is one-sided.
- The code then derives the opposite side as a complement, which turns bad inputs into fake `99.9% / 0.1%` or `100% / 0%`.

2. Over-aggressive UI rounding
- The UI rounds probabilities with `Math.round(price * 100)`.
- So a real Polymarket price like `0.9995 / 0.0005` becomes `100% / 0%` visually.
- That is misleading even when the market really is just extremely skewed.

What I found in live Polymarket data

- Moneyline market `1510731` — Movsar Evloev vs Lerone Murphy
  - Stored in app: `0.999 / 0.001`
  - CLOB `price?side=BUY`: `0.999` and `0`
  - Gamma market data: `outcomePrices = [0.685, 0.315]`, `bestBid=0.68`, `bestAsk=0.69`
  - Conclusion: our app is wrong here

- Moneyline market `1510805` — Louie Sutherland vs Brando Pericic
  - Stored in app: `0 / 1`
  - Gamma market data: `outcomePrices = [0.325, 0.675]`, `bestBid=0.32`, `bestAsk=0.33`
  - Conclusion: our app is wrong here too

- Prop market `1510736` — Fight won by submission?
  - Gamma market data: `0.0005 / 0.9995`
  - Conclusion: this one is legitimately near 0% / 100%, but the UI should not round it to hard `0% / 100%`

- Prop market `1510741` — O/U 4.5 Rounds
  - Gamma market data: `0.9995 / 0.0005`
  - Conclusion: also legitimately extreme, but UI precision is too coarse

Root cause

- We are using a tradable orderbook endpoint as if it were a display-odds endpoint.
- MMA is hit hardest because those markets and props often have thinner or one-sided books.
- Then the UI rounds tiny probabilities into impossible-looking `0%` / `100%`.

Plan to fix

1. Replace Polymarket display pricing source in `polymarket-prices`
- Stop using CLOB `price?side=BUY` as the primary source for display odds.
- Use Gamma `outcomePrices` as the canonical display price for imported Polymarket fights.
- Optionally use CLOB only for diagnostics or execution-related metadata, not public odds display.

2. Add a price-source sanity check
- If CLOB-derived values differ materially from Gamma `outcomePrices`, prefer Gamma and flag the fight in logs/notes.
- This prevents future MMA imports from silently drifting to fake `0/100`.

3. Improve UI percentage formatting
- Stop rounding to whole integers for Polymarket probability bars.
- Show one decimal for tight extremes, or format as `<1%` / `>99%` when appropriate.
- This keeps legitimate `99.95 / 0.05` markets from rendering as impossible `100 / 0`.

4. Backfill current MMA fights
- After the worker change, resync all active Polymarket MMA fights so stored `price_a` / `price_b` are corrected from Gamma.
- This should fix the bad moneyline cards immediately.

5. Add regression protection
- Add a guard in the worker/admin diagnostics:
  - if a moneyline market has Gamma `outcomePrices` in a normal range but stored app prices are near `0/1`, flag it
  - if a market is extreme but not exactly `0/100`, the UI must display precision instead of integer rounding

Files to update

- `supabase/functions/polymarket-prices/index.ts`
- `src/components/predictions/FightCard.tsx`
- `src/components/predictions/PredictionHighlights.tsx`
- `src/components/predictions/HomePredictionHighlights.tsx`

Expected outcome

- MMA moneyline odds will match the prices Polymarket actually shows.
- Truly extreme prop markets will still look extreme, but no longer display as fake hard `0% / 100%`.
- The system will automatically catch this class of bad sync in the future.
