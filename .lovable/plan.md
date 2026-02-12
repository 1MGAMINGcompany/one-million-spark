

# Fix: Deep Links as Primary Mobile Wallet Connection

## Problem
On mobile Chrome/Safari, `window.solana` is never injected. Calling `select()` + `connect()` always fails silently. The current code tries this first, then shows deep links as a secondary fallback -- but users get bounced between apps with no connection.

## Solution
On mobile regular browsers, wallet buttons directly trigger deep links. Inside wallet browsers or on desktop, keep the standard `select()` + `connect()` flow.

## Files Changed

### 1. `src/components/WalletButton.tsx`

**`handleWalletClick` (lines 548-591)** -- add a mobile regular browser branch at the top:
- If `isMobile && !isInWalletBrowser`: call `handleWalletDeepLink(walletId)` for phantom/solflare/backpack instead of `select()`/`connect()`
- If `isInWalletBrowser` or desktop: keep existing `select()` + `connect()` flow unchanged

**Wallet button labels (lines 668-690)** -- on mobile regular browser, show "Open in Phantom" instead of just "Phantom" to set expectations

**Remove duplicate deep link sections (lines 692-753)** -- the iOS instructions block and Android deep link fallback at the bottom of the dialog become unnecessary since the wallet buttons themselves now handle deep links on mobile

**Keep MWA as secondary option on Android (lines 652-665)** -- "Use Installed Wallet" button stays for users who prefer MWA

### 2. `src/components/ConnectWalletGate.tsx`

**`handleSelectWallet` (lines 149-172)** -- same change:
- If `isMobile && !isInWalletBrowser`: use deep link directly for phantom/solflare, or deep link for backpack
- Otherwise: keep existing flow

**Remove duplicate deep link sections (lines 233-282)** -- iOS and Android deep link sections at bottom of dialog removed (now handled by the primary buttons)

**Update button labels** -- show "Open in [Wallet]" on mobile regular browser

### 3. `src/components/MobileWalletFallback.tsx`

- Make deep link buttons the primary/top section (rename from "Alternative")
- Remove the "Connect Now" button that calls `connect()` from regular browser (can never work)
- Keep copy-link buttons as last resort

## What Users Will See

**Mobile regular browser**: Tap "Connect Wallet" -> tap "Open in Phantom" -> Phantom app opens with site loaded -> auto-connect polling connects within 1-3 seconds

**Inside wallet browser**: Auto-connect works automatically, or tap "Phantom" to call `connect()` directly

**Desktop**: No changes at all

