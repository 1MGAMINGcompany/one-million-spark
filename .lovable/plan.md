
# Fix: Translate All Hardcoded English Strings in Wallet Components

## Problem
There are 10+ hardcoded English strings scattered across the wallet connection components. This violates the zero-leak i18n rule and means non-English users see a mix of translated and untranslated text.

## Hardcoded Strings Found

| String | File(s) |
|--------|---------|
| `Open in ${wallet.name}` | WalletButton, ConnectWalletGate, MobileWalletFallback |
| `Opens wallet browser` | WalletButton, ConnectWalletGate, MobileWalletFallback |
| `Use Installed Wallet` | WalletButton, ConnectWalletGate |
| `Phantom, Solflare, Backpack` (MWA subtitle) | WalletButton, ConnectWalletGate |
| `Or use "Use Installed Wallet" above...` | WalletButton, ConnectWalletGate |
| `How to connect & get SOL` | ConnectWalletGate, WalletGateModal |
| `Select your wallet provider to connect` | ConnectWalletGate |
| `Open this page in your wallet's browser` | MobileWalletFallback |

## Solution

### 1. Add new i18n keys to `en.json` (wallet section)

Add these keys (some already exist and just need to be used):
- `wallet.openInWallet`: "Open in {{wallet}}" 
- `wallet.opensWalletBrowser`: "Opens wallet browser"
- `wallet.useInstalledWallet`: "Use Installed Wallet"
- `wallet.mwaSubtitle`: "Phantom, Solflare, Backpack"
- `wallet.mwaNote`: "Or use \"Use Installed Wallet\" above for system wallet picker"
- `wallet.howToConnectSol`: "How to connect & get SOL"
- `wallet.selectProvider`: "Select your wallet provider to connect"
- `wallet.openPageInWalletBrowser`: "Open this page in your wallet's browser"

### 2. Add translations for all 10 language files

Add the same keys to: es, pt, fr, de, ar, zh, it, ja, hi

Also backfill any missing existing keys (like `detected`, `inWalletBrowser`, `stillNotDetected`, `balance`, `connected`) in language files that are missing them (notably FR which has fewer wallet keys).

### 3. Replace hardcoded strings in components

**`src/components/WalletButton.tsx`** (3 locations):
- Line 678: `Open in ${wallet.name}` becomes `t("wallet.openInWallet", { wallet: wallet.name })`
- Line 684: `"Opens wallet browser"` becomes `t("wallet.opensWalletBrowser")`
- Line 654: `"Use Installed Wallet"` becomes `t("wallet.useInstalledWallet")`
- Line 655: `"Phantom, Solflare, Backpack"` becomes `t("wallet.mwaSubtitle")`
- Line 695: MWA note becomes `t("wallet.mwaNote")`

**`src/components/ConnectWalletGate.tsx`** (5 locations):
- Line 226: `"How to connect & get SOL"` becomes `t("wallet.howToConnectSol")`
- Line 236: `"Select your wallet provider..."` becomes `t("wallet.selectProvider")`
- Line 251: `"Use Installed Wallet"` becomes `t("wallet.useInstalledWallet")`
- Line 252: `"Phantom, Solflare, Backpack"` becomes `t("wallet.mwaSubtitle")`
- Line 275: `Open in ${wallet.name}` becomes `t("wallet.openInWallet", { wallet: wallet.name })`
- Line 281: `"Opens wallet browser"` becomes `t("wallet.opensWalletBrowser")`
- Line 298: MWA note becomes `t("wallet.mwaNote")`

**`src/components/MobileWalletFallback.tsx`** (3 locations):
- Line 87: `"Open this page in your wallet's browser"` becomes `t("wallet.openPageInWalletBrowser")`
- Line 98: `Open in ${wallet.name}` becomes `t("wallet.openInWallet", { wallet: wallet.name })`
- Line 99: `"Opens wallet browser"` becomes `t("wallet.opensWalletBrowser")`

**`src/components/WalletGateModal.tsx`** (1 location):
- Line 68: `"How to connect & get SOL"` becomes `t("wallet.howToConnectSol")`

Also fix toast on line 582 of WalletButton.tsx: `` `${walletId} wallet not detected...` `` should use `t("wallet.walletNotDetected", { wallet: walletId })`

### 4. Backfill missing wallet keys in FR and other languages

French and some other language files are missing several wallet keys that EN/ES have (like `balance`, `connected`, `detected`, `inWalletBrowser`, `stillNotDetected`, `noWalletsDetected`, `installWallet`, `mobileHelperText`, `retryHelperText`, `walletNotDetected`, `openWalletApp`, `alreadyInWallet`, `copySite`, `copyPage`, etc.). These will be added to all 9 non-English locale files.

## Files Changed
- `src/i18n/locales/en.json` -- add 8 new keys
- `src/i18n/locales/es.json` -- add 8 new keys (translated)
- `src/i18n/locales/pt.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/fr.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/de.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/ar.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/zh.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/it.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/ja.json` -- add 8 new keys + backfill missing
- `src/i18n/locales/hi.json` -- add 8 new keys + backfill missing
- `src/components/WalletButton.tsx` -- replace 5 hardcoded strings with t() calls
- `src/components/ConnectWalletGate.tsx` -- replace 7 hardcoded strings with t() calls
- `src/components/MobileWalletFallback.tsx` -- replace 3 hardcoded strings with t() calls
- `src/components/WalletGateModal.tsx` -- replace 1 hardcoded string with t() call
