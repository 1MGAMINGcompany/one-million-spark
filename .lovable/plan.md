

# Fix Privy Branding, Smooth Predictions, Sell Feature, and Geo-Block Visibility

## Changes

### 1. Fix Privy SIWE branding
**File**: `src/hooks/usePolymarketSession.ts`
- Change `SIWE_MESSAGE_PREFIX` from `"Sign to enable Polymarket trading on 1MGAMING"` to `"Sign to enable trading on 1mg.live"`

### 2. Stop showing wallet setup errors as blockers
**Files**: `src/pages/platform/OperatorApp.tsx`, `src/pages/FightPredictions.tsx`
- Remove the blocking `EnableTradingBanner` error display when setup fails since the backend falls back to shared credentials
- Keep background setup attempt but suppress error toasts for `trading_wallet_setup_required`

### 3. Surface geo-blocks clearly in OperatorApp
**File**: `src/pages/platform/OperatorApp.tsx`
- Currently only shows a toast. Add `geoBlocked` state + render the `GeoBlockScreen` component (same pattern already working in `FightPredictions.tsx`)
- On `clob_geo_blocked` or `geo_blocked` error code, set state and show the full geo-block UI with waitlist + read-only mode

### 4. Translate GeoBlockScreen
**File**: `src/components/predictions/GeoBlockScreen.tsx`
- All strings are hardcoded English ("Service Not Available in Your Region", "Join the Waitlist", etc.)
- Add `useTranslation()` and translation keys to all 10 locale files under a `geoBlock` section

### 5. Add "Sell Position" feature
**New file**: `supabase/functions/prediction-sell/index.ts`
- Accept `{ fight_id, wallet }` with Privy auth
- Look up user's filled BUY position from `prediction_trade_orders`
- Submit a SELL order (`side: 1`) to the Polymarket CLOB
- Record the sell in `prediction_trade_orders` with `side: "SELL"`
- Use shared credentials fallback if no per-user session

**UI**: `src/components/operator/SimplePredictionCard.tsx`
- Add a "Sell" button when user has a filled position and the market is still open
- Show current price and estimated payout

**Integration**: `src/pages/platform/OperatorApp.tsx`, `src/pages/FightPredictions.tsx`
- Add `handleSell` function calling `prediction-sell`
- Pass `onSell` callback to `SimplePredictionCard`

### 6. Improve claim visibility
**File**: `src/components/operator/SimplePredictionCard.tsx`
- Add pulse animation to the Claim button when available
- Show estimated reward amount

### 7. Update FAQ
**File**: `src/components/seo/FAQSection.tsx`
- Change "planned for future updates" to reflect that selling is now available

### 8. Translations for all new features
**Files**: All 10 locale files in `src/i18n/locales/`
- Add keys for: `geoBlock.*` (region title, waitlist, VPN notice, read-only), `operator.sellPosition`, `operator.selling`, `operator.sold`, `operator.estimatedPayout`, `operator.currentPrice`

## Technical details
- Polymarket SELL orders use `side: 1` with the same EIP-712 signing format as BUY orders
- Sell price is fetched from the CLOB price endpoint with `side=SELL`
- Geo-block detection already works in `FightPredictions.tsx` — needs to be mirrored in `OperatorApp.tsx` with the full `GeoBlockScreen` UI, not just a toast

## Expected outcome
- Privy dialog says "1mg.live" instead of "1MGAMING"
- Geo-blocked users see a clear, translated geo-restriction screen with waitlist and read-only option
- No more blocking "deployment failed" errors since shared credentials work
- Users can sell positions at any time before event resolution
- Users can claim winnings with a visible, animated button
- All new UI respects the user's language setting

