

# Fix Wallet Buttons + Add Full i18n for All New UI Strings

## Problem
1. Multiple hardcoded English strings were introduced in recent UI changes (AddSolCard, WelcomeIntroModal, Navbar external wallet text, PrivyLoginButton) -- none of them use `useTranslation()` or i18n keys.
2. The ConnectWalletGate still has mobile auto-connect polling that contradicts the "no auto-connect" requirement.
3. All 10 locale files (en, es, fr, de, ar, zh, it, ja, hi, pt) need the new translation keys.

## Changes

### 1. Add new i18n keys to `en.json`
Add a new `"addSol"` block and `"welcomeIntro"` block to the English locale:

```
"addSol": {
  "title": "Add SOL to Start Playing",
  "subtitle": "Your wallet is ready. Add SOL to enter skill matches.",
  "balance": "Balance: {{balance}} SOL",
  "tooltipWalletCreated": "Your wallet is created automatically",
  "tooltipAddSol": "Add SOL to enter skill matches",
  "tooltipBalanceUpdates": "Balance updates automatically",
  "fundingOptions": "Funding Options",
  "sendSol": "Send SOL from any wallet",
  "sendSolDesc": "Copy your address or scan the QR code to send SOL.",
  "buySolPhantom": "Buy SOL in Phantom",
  "buyInPhantom": "Buy in Phantom",
  "transferExchange": "Transfer from an exchange",
  "exchangeStep1": "Go to your exchange (Coinbase, Binance, etc.)",
  "exchangeStep2": "Withdraw SOL",
  "exchangeStep3": "Paste your wallet address",
  "exchangeStep4": "Select Solana network",
  "exchangeStep5": "Confirm transfer",
  "waitingForSol": "Waiting for SOL...",
  "balanceRefreshNote": "Balance refreshes every 10 seconds.",
  "funded": "You're funded -- let's play!"
},
"welcomeIntro": {
  "title": "Welcome to",
  "brand": "1M Gaming",
  "walletReady": "Wallet ready",
  "walletReadyDesc": "Your wallet was created automatically.",
  "addSol": "Add SOL",
  "addSolDesc": "Fund your wallet to enter matches.",
  "joinMatch": "Join a match",
  "joinMatchDesc": "Play chess, backgammon, dominos & more.",
  "gotIt": "Got it",
  "dontShowAgain": "Don't show again"
},
"wallet": {
  ... (existing keys stay),
  "externalWallet": "External Wallet",
  "advancedConnectExternal": "Advanced: Connect External Wallet",
  "alreadyHavePhantom": "Already have Phantom? Connect it here.",
  "continue": "Continue",
  "walletLoginNotConfigured": "Wallet login not configured"
}
```

### 2. Add translations to all 9 non-English locale files
Add properly translated versions of the above keys to: es, fr, de, ar, zh, it, ja, hi, pt.

### 3. Update `AddSolCard.tsx` to use i18n
- Import `useTranslation`
- Replace all 15+ hardcoded English strings with `t("addSol.xxx")` calls

### 4. Update `WelcomeIntroModal.tsx` to use i18n
- Import `useTranslation`
- Replace all hardcoded strings with `t("welcomeIntro.xxx")` calls

### 5. Update `PrivyLoginButton.tsx` to use i18n
- Import `useTranslation`
- Replace "Continue", "Disconnect", "Wallet login not configured" with i18n keys

### 6. Update `Navbar.tsx` to use i18n for external wallet strings
- Replace hardcoded "External Wallet", "Advanced: Connect External Wallet", "Already have Phantom? Connect it here." with `t()` calls

### 7. Remove auto-connect polling from `ConnectWalletGate.tsx`
- Remove the `useEffect` (lines 94-124) that polls for injected wallet providers on mobile and auto-connects
- This aligns with the requirement that external wallets must NOT auto-connect

## Files Modified
- `src/i18n/locales/en.json` -- new keys
- `src/i18n/locales/es.json` -- translations
- `src/i18n/locales/fr.json` -- translations
- `src/i18n/locales/de.json` -- translations
- `src/i18n/locales/ar.json` -- translations
- `src/i18n/locales/zh.json` -- translations
- `src/i18n/locales/it.json` -- translations
- `src/i18n/locales/ja.json` -- translations
- `src/i18n/locales/hi.json` -- translations
- `src/i18n/locales/pt.json` -- translations
- `src/components/AddSolCard.tsx` -- use `t()` for all strings
- `src/components/WelcomeIntroModal.tsx` -- use `t()` for all strings
- `src/components/PrivyLoginButton.tsx` -- use `t()` for all strings
- `src/components/Navbar.tsx` -- use `t()` for external wallet section
- `src/components/ConnectWalletGate.tsx` -- remove auto-connect polling

## What Does NOT Change
- No game logic, timers, room logic, Supabase functions, or Solana program code
- ConnectWalletGate connect buttons and deep links remain fully functional
- WalletButton internals unchanged
- Privy login flow unchanged
