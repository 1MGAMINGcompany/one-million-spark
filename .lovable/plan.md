

# Rebrand Graph Footer + Add Tips Button to Operator Cards

## Part 1: Remove Polymarket Branding from Graph Modal

**File: `src/components/operator/MarketGraphModal.tsx`**

Lines 329-334 — change "Powered by live Polymarket data" to "Powered by 1mg.live":

```tsx
{fight.source === "polymarket" && (
  <p className="text-[10px] text-center" style={{ color: theme.textMuted }}>
    Powered by 1mg.live
  </p>
)}
```

Single line change, no logic impact.

---

## Part 2: Add Tips Button + Tips Modal

### 2a. Add `onTips` callback to `SimplePredictionCard`

**File: `src/components/operator/SimplePredictionCard.tsx`**

- Add `onTips?: (fight: Fight) => void` to the props interface
- Add a `TipsButton` component next to the existing `GraphButton`, styled identically but with a `Lightbulb` icon and "Tips" label
- Render `<TipsButton />` next to `<GraphButton />` in all card states (open, live, picked)

### 2b. Create `MarketTipsModal` component

**New file: `src/components/operator/MarketTipsModal.tsx`**

A themed modal (same shell as `MarketGraphModal`) that:

1. **Header**: "Tips" with Lightbulb icon, event title, team names
2. **Smart Money section**: Uses existing `src/lib/smart-money.ts` to show Activity, Momentum, Whale Signal, and Quick Read — rendered as themed stat cards
3. **AI Analysis section**: Calls the existing `prediction-ai-insight` edge function (already built, already sanitized to never mention Polymarket) to get a 2-3 sentence market summary, confidence label, signal tags, and caution note
4. **Big Wallet Chat**: A single AI-generated paragraph explaining what large wallet activity suggests for this event, using data from smart-money signals + the AI insight summary. This uses the same `prediction-ai-insight` edge function with an enhanced prompt asking specifically about big player positioning
5. **Footer**: "Powered by 1mg.live" (no Polymarket references)

All text uses prediction-safe terminology (no "bet", "gamble", "wager"). Inherits operator theme.

### 2c. Wire Tips into OperatorApp

**File: `src/pages/platform/OperatorApp.tsx`**

- Add `tipsFight` state (same pattern as `graphFight`)
- Pass `onTips={(f) => setTipsFight(f)}` to each `SimplePredictionCard`
- Render `<MarketTipsModal>` at the bottom alongside `<MarketGraphModal>`

### 2d. Enhance the AI insight edge function for Tips context

**File: `supabase/functions/prediction-ai-insight/index.ts`**

Add an optional `mode: "tips"` parameter. When `mode === "tips"`, use an extended system prompt that also includes:
- Big wallet activity analysis (based on volume/liquidity signals passed in)
- Actionable positioning guidance ("Where are the big wallets leaning?")
- All under 1mg.live branding, zero Polymarket references

Same model, same endpoint, just a richer prompt for the tips use case.

---

## What Does NOT Change
- Settlement, payouts, claims — untouched
- Auth, routing, operator themes — untouched
- 1mgaming.com flagship — untouched
- Graph modal logic/chart — untouched (only footer text changes)
- Existing `PredictionInsightsPanel` on flagship — untouched

## Technical Details
- Reuses existing `prediction-ai-insight` edge function + `smart-money.ts` — no new API dependencies
- The Tips modal is purely informational — no trading actions
- AI responses are cached client-side (5-min TTL, same as existing insights)
- The `prediction-ai-insight` prompt already forbids Polymarket mentions

