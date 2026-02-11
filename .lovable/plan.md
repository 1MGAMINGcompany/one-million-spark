
# Fix: Mobile Wallet Detection — Use MWA Fallback

## Problem
When you tap "Solflare" (or "Backpack") on Android in a regular mobile browser, the app searches for a browser extension adapter named "solflare". Since Solflare is installed as a **mobile app** (not a browser extension), no adapter is found, and the "Solflare not detected" modal appears.

The "Use Installed Wallet" (MWA) button at the top works fine — it opens the Android wallet chooser where Solflare appears. But tapping the Solflare button directly does not use this path.

## Solution
On Android, when a specific wallet button is tapped and no matching adapter is found in the browser, **fall back to MWA** (Mobile Wallet Adapter) instead of showing the "not detected" modal. MWA opens the Android system wallet chooser, which lists all installed Solana wallets including Solflare.

On iOS (where MWA is not available), keep the current behavior of showing the "not detected" modal with deep link options.

## Files Changed

### 1. `src/components/WalletButton.tsx`
In `handleWalletClick` (around line 547):
- Current: if no matching adapter found on mobile, show "not detected" modal
- New: if no matching adapter found **and Android has MWA**, use MWA instead. Only show "not detected" modal on iOS or if MWA is unavailable.

### 2. `src/components/ConnectWalletGate.tsx`
In `handleSelectWallet` (around line 116):
- Same change: if no matching adapter and Android has MWA, fall back to MWA connect instead of showing the "not detected" modal.

## Technical Details

**WalletButton.tsx** — `handleWalletClick` change (lines 577-581):
```typescript
// Current code:
} else if (isMobile) {
  setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
  setDialogOpen(false);
}

// New code:
} else if (isMobile) {
  // Android with MWA: use MWA to open system wallet picker (includes Solflare, etc.)
  if (isAndroid && hasMWA) {
    handleMWAConnect();
  } else {
    // iOS or no MWA: show "not detected" modal with deep link fallback
    setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
    setDialogOpen(false);
  }
}
```

**ConnectWalletGate.tsx** — `handleSelectWallet` change (lines 126-129):
```typescript
// Current code:
} else if (isMobile) {
  setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
  setDialogOpen(false);
}

// New code:
} else if (isMobile) {
  if (isAndroid && hasMWA) {
    handleMWAConnect();
  } else {
    setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
    setDialogOpen(false);
  }
}
```

## What This Means for Users
- **Android**: Tapping any wallet button (Phantom, Solflare, Backpack) will either connect directly (if the browser extension exists) or open the Android wallet chooser via MWA where all installed wallets appear
- **iOS**: No change — still shows the "not detected" modal with deep link to open in wallet browser (since MWA doesn't exist on iOS)
- **Desktop**: No change — still shows toast error if extension not installed
