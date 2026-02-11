

# Fix Wallet Switching — Show Wallet Buttons in WalletButton.tsx

## Root Cause
The navbar's "Connect Wallet" dialog lives in `WalletButton.tsx` (not `ConnectWalletGate.tsx`). This file was **never updated** with the same fixes we applied to `ConnectWalletGate.tsx`. It still has the old gating that hides Phantom/Solflare/Backpack buttons on mobile and shows only "Open in wallet browser" deep links instead.

Two blocking conditions:
- **Line 662**: iOS users only see deep-link buttons ("Open in Phantom", "Open in Solflare")
- **Line 695**: `(!isMobile || isInWalletBrowser)` hides the 3 wallet buttons on mobile

## What Changes

### WalletButton.tsx — Single file change

1. **Remove the iOS-only deep link section** (lines 661-692)
   - Currently: `{isIOS && !isInWalletBrowser && ( ... deep links only ... )}`
   - These deep links will move to the secondary fallback section below

2. **Remove the desktop/in-app-only gate on wallet buttons** (line 695)
   - Currently: `{(!isMobile || isInWalletBrowser) && ( ... wallet buttons ... )}`
   - Change: Always show the 3 wallet buttons (Phantom, Solflare, Backpack) on ALL platforms — no conditional wrapper

3. **Update the Android deep-link section to cover all mobile** (lines 724-753)
   - Currently: `{isAndroid && !isInWalletBrowser && ( ... )}`
   - Change: `{isMobile && !isInWalletBrowser && ( ... )}` — show deep links as a secondary "Or open in wallet browser" fallback for all mobile users (iOS and Android), not just Android

This matches exactly what we already did in `ConnectWalletGate.tsx`.

## What stays the same
- MWA button for Android at the top
- Desktop "Get Wallet" install links section
- In-wallet-browser success indicator
- All disconnect, balance, copy address logic
- `ConnectWalletGate.tsx` (already fixed)

## How similar apps handle this
Apps like Raydium, Jupiter, and Tensor show all wallet options in one list regardless of platform. Deep links to wallet browsers are either absent or shown as a small secondary note. The wallet picker always displays Phantom, Solflare, Backpack as clickable buttons.

## Technical Details

| Line(s) | Current Code | New Code |
|---|---|---|
| 661-692 | `{isIOS && !isInWalletBrowser && ( ...deep links only... )}` | Remove entire block |
| 695 | `{(!isMobile \|\| isInWalletBrowser) && (` | Remove conditional — always render wallet buttons |
| 721-722 | `</>` and `)}` closing the conditional | Remove these closing tags |
| 725 | `{isAndroid && !isInWalletBrowser && (` | `{isMobile && !isInWalletBrowser && (` |

