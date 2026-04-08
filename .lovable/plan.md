

# Fix: Translate Trading Wallet Banner and Market Tips Modal

## Issues Found

1. **"Trading wallet deployment failed" in English** — The `EnableTradingBanner` component has every string hardcoded in English (titles, descriptions, button labels). It does not use `useTranslation()` at all.

2. **Market Tips modal in English** — `MarketTipsModal` has all UI labels hardcoded: "Tips", "Big Player Activity", "Activity", "Momentum", "Large Trades", "AI Analysis", "Analyzing market...", "Where Big Wallets Are Leaning", "Powered by 1mg.live", etc. No `t()` calls.

3. **AI insight response in English** — The `prediction-ai-insight` edge function returns English text. It needs the user's language passed so it can respond in the correct language.

## Plan

### 1. Add translation keys to all 10 locale files
Add a `tradingWallet` and `marketTips` section to each locale JSON with keys for:
- Trading banner: `ready`, `finalizing`, `needsFinalSetup`, `deploymentIncomplete`, `setUp`, `readyDescription`, `finalizingDescription`, `incompleteDescription`, `deploymentDescription`, `signOnce`, `working`, `retrySetup`, `setUpButton`, `statusLabel`
- Market tips: `title`, `bigPlayerActivity`, `activity`, `momentum`, `largeTrades`, `quickRead`, `aiAnalysis`, `analyzingMarket`, `bigWalletLeaning`, `aiUnavailable`, `poweredBy`

### 2. Update EnableTradingBanner to use `useTranslation()`
- Import and call `useTranslation()`
- Replace all hardcoded strings with `t('tradingWallet.xxx')` calls

### 3. Update MarketTipsModal to use `useTranslation()`
- Import and call `useTranslation()`
- Replace all hardcoded labels with `t('marketTips.xxx')` calls
- Pass `i18n.language` to the AI insight query so the backend can respond in the user's language

### 4. Update prediction-ai-insight edge function
- Accept a `lang` parameter in the request body
- Add language instruction to the AI prompt so responses come back in the user's language

### 5. Fix the trading wallet error display
- The error from setup (e.g., "Trading wallet deployment failed") comes from the backend. Map known error codes to translated strings in the frontend instead of showing raw English backend messages.

## Files to Edit
- `src/components/predictions/EnableTradingBanner.tsx`
- `src/components/operator/MarketTipsModal.tsx`
- `supabase/functions/prediction-ai-insight/index.ts`
- All 10 locale files under `src/i18n/locales/`

## Expected Outcome
- All trading wallet UI and market tips appear in the user's selected language
- AI analysis responses come back in the user's language
- No more raw English error messages shown to non-English users

