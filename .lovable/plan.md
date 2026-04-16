

## Plan: Tiered live-odds requote UX in SimplePredictionModal

### Problem
Live WS prices already flow into the `fight` prop and silently re-render the payout. There's no protection against the user submitting against a price that just jumped, and the only "requote" UI is the backend 409 path. We need a tiered, client-side movement detector that runs while the modal is open.

### Approach (single file change)
All changes go in `src/components/operator/SimplePredictionModal.tsx`. No backend, no parent, no other components.

1. **Track baseline price**
   - On modal mount, snapshot the picked side's price into `baselinePriceRef` and a `baselinePrice` state.
   - On every render, read the current price from `fight.price_a` / `fight.price_b` (already updated by WS via parent).
   - Compute `drift = Math.abs(current - baseline) / baseline` (guard divide-by-zero; skip if baseline ≤ 0).

2. **Three tiers**
   - `small` (drift < 5%): silently update payout. Show a tiny `⟳ Odds updated` chip in amber near the payout box for ~2s after each change. Submit button stays active and uses the new price.
   - `large` (5% ≤ drift < 15%): show the live payout with the **old return crossed out** and the new return bold next to it. Replace the primary submit button with a single gold "⚡ Accept New Odds — Place $X Prediction" button. On click, update baseline → new price and submit. Original submit is hidden (never two active buttons).
   - `extreme` (drift ≥ 15%): replace the modal body with a centered warning screen: "⚠️ Market moved significantly — please review the updated odds before predicting" with two buttons: "Review Updated Odds" (resets baseline to current price, returns to normal modal state) and "Cancel" (calls `onClose`).

3. **State machine**
   - `quoteState: "fresh" | "drifted-small" | "drifted-large" | "drifted-extreme"` derived from drift.
   - On submit (any path), update baseline to the price actually being submitted so post-submit re-renders don't immediately re-trigger a tier.
   - Reset baseline whenever `pick` changes or modal reopens.

4. **Coexistence with existing backend 409 requote**
   - Keep the existing `requoteData` block exactly as-is — it handles the server-rejected case after submit. The new client-side tiers handle pre-submit drift. They cannot show simultaneously: if `requoteData` is present, skip rendering the drift banners (server requote takes priority since it's the authoritative final price).

5. **i18n**
   - Add 6 new keys under `operator.modal`: `oddsUpdated`, `marketMovedTitle`, `marketMovedBody`, `reviewUpdatedOdds`, `cancel`, `acceptNewOddsAndPlace` (with `{amount}` interpolation).
   - Add to all 10 locale files.

6. **Custom (non-Polymarket) events**
   - Skip drift detection entirely — custom events use parimutuel pools, not live odds. Guard: only run drift logic when `!isCustomEvent`.

### Files changed
- `src/components/operator/SimplePredictionModal.tsx` (single component, ~60 lines added)
- `src/i18n/locales/{en,es,pt,fr,de,it,zh,ja,ar,hi}.json` (6 keys each)

### What does NOT change
- No backend changes
- No changes to `usePolymarketLivePrices` or parent `OperatorApp.tsx`
- No changes to existing `requoteData` server-side flow, `TradeTicket`, or `PredictionModal.tsx` (flagship)
- No changes to settlement, payout, sweep, or trading logic
- Custom/operator events are unaffected

