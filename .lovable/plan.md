
# Re-enable Mobile Wallet Connection from Regular Browsers

## Problem
Mobile users in regular browsers (Safari, Chrome) are currently blocked from connecting wallets. They're forced to open the app inside a wallet's in-app browser (Phantom, Solflare). This was done for iOS compatibility but it also blocks Android users who can use MWA from any browser.

## What Changes

### 1. ConnectWalletGate.tsx -- Show wallet buttons on ALL platforms

Currently line 244 hides wallet buttons on mobile unless in-app:
```
{(!isMobile || isInWalletBrowser) && ( ... wallet buttons ... )}
```

**Change:** Always show the three wallet buttons (Phantom, Solflare, Backpack) regardless of platform. Keep the MWA button for Android as a top option. Keep deep-link buttons as a secondary "Or open in wallet browser" section for iOS/Android -- but no longer hide the direct connect buttons.

### 2. ConnectWalletGate.tsx -- iOS section change

Currently line 213 shows ONLY deep links for iOS users not in wallet browser:
```
{isIOS && !isInWalletBrowser && ( ... deep links only ... )}
```

**Change:** Remove this exclusive iOS deep-link section. Instead, show the standard wallet buttons for everyone, and move the deep-link options to a secondary "Alternative: open in wallet browser" section below (for cases where direct connect fails).

### 3. CreateRoom.tsx -- Remove mobile wallet redirect gate

Currently line 132 and line 222 block room creation on mobile:
```
const needsMobileWalletRedirect = isMobileDevice() && !hasInjectedSolanaWallet();
if (needsMobileWalletRedirect) { setShowMobileWalletRedirect(true); return; }
```

**Change:** Remove the `needsMobileWalletRedirect` variable and all its conditional checks. Remove the `MobileWalletRedirect` modal import and rendering. If the user has no wallet connected, let the existing `ConnectWalletGate` component handle it (it already shows when `!publicKey`).

### 4. Room.tsx -- Remove mobile wallet redirect gate

Same pattern as CreateRoom -- lines 139, 605, 677, 701, 746 all block actions with the redirect modal.

**Change:** Remove all `needsMobileWalletRedirect` checks and the `MobileWalletRedirect` modal. Let existing wallet connection UI handle the flow naturally.

### 5. SolanaProvider.tsx -- Enable autoConnect

Currently line 39: `autoConnect={false}`

**Change:** Set `autoConnect={true}` so returning users who previously connected get auto-reconnected on page load. This restores the session seamlessly on both desktop and mobile.

---

## What stays the same
- Preview domain signing block (PreviewDomainBanner) -- still needed for security
- WebRTC disable in wallet browsers -- still correct for those environments  
- WalletNotDetectedModal -- still useful when a wallet isn't installed
- Deep-link buttons remain available as a secondary option, not the only option

## Summary of files changed
| File | Change |
|---|---|
| `src/components/ConnectWalletGate.tsx` | Show wallet buttons on all platforms; move deep links to secondary section |
| `src/pages/CreateRoom.tsx` | Remove `needsMobileWalletRedirect` gate and `MobileWalletRedirect` modal |
| `src/pages/Room.tsx` | Remove `needsMobileWalletRedirect` gate and `MobileWalletRedirect` modal |
| `src/components/SolanaProvider.tsx` | Set `autoConnect={true}` |
