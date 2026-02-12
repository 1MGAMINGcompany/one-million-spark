

# Fix: Mobile Wallet Connection Loop ("Try tapping Connect again")

## Problem
On Android mobile, when you tap a wallet button:
1. The app tries MWA (Mobile Wallet Adapter) which calls `select()` + `connect()`
2. This either opens the wallet app briefly or does nothing visible
3. After 8 seconds, a timeout fires and shows the fallback panel with "If connection didn't work, try tapping Connect again"
4. If you tap the deep link buttons instead ("Open in Phantom/Solflare"), it opens the wallet's browser, but when you return to the regular browser, the same fallback message appears

On iOS, the deep link opens the wallet browser, but the auto-connect doesn't reliably kick in when the page loads inside the wallet browser.

## Root Causes
1. **MWA timeout too aggressive** -- 8 seconds (`CONNECT_TIMEOUT_MS`) is not enough for MWA to complete the round-trip to the wallet app and back
2. **Auto-connect in wallet browser is fragile** -- the auto-sync effect (line 371-395 in WalletButton) checks `window.solana?.isConnected` on mount, but the wallet provider may not be injected yet when the effect runs
3. **No polling/retry for wallet provider injection** -- when the site loads inside a wallet browser, the injected `window.solana` may appear after React mounts
4. **Deep link fallback panel fires too early** -- `handleWalletDeepLink` shows the fallback after just 1.5 seconds

## Solution

### 1. `src/components/WalletButton.tsx` -- Fix auto-connect in wallet browser
Replace the one-shot auto-sync effect with a polling approach that retries for up to 3 seconds waiting for the wallet provider to inject:

```typescript
useEffect(() => {
  if (connected || connecting) return;
  if (!isMobile) return;

  // Poll for injected wallet provider (wallets inject async in mobile browsers)
  let attempts = 0;
  const maxAttempts = 15; // 15 x 200ms = 3 seconds
  
  const interval = setInterval(() => {
    attempts++;
    const win = window as any;
    const hasProvider = win.solana || win.phantom?.solana || win.solflare;
    
    if (hasProvider) {
      clearInterval(interval);
      // Find the installed wallet adapter and connect
      const installed = wallets.find(w => w.readyState === 'Installed');
      if (installed && !connected) {
        console.log("[WalletAutoConnect] Provider detected, connecting via", installed.adapter.name);
        select(installed.adapter.name);
        connect().catch(err => console.warn("[WalletAutoConnect] Failed:", err));
      }
    }
    
    if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 200);

  return () => clearInterval(interval);
}, []); // Run once on mount
```

### 2. `src/components/WalletButton.tsx` -- Increase MWA timeout
Change `CONNECT_TIMEOUT_MS` from 8000 to 15000 (15 seconds) to give MWA more time on slower devices:

```typescript
const CONNECT_TIMEOUT_MS = 15000; // Was 8000
```

### 3. `src/components/WalletButton.tsx` -- Remove premature deep link fallback
In `handleWalletDeepLink` (line 290-303), remove the 1.5-second timeout that shows the fallback panel. The user navigated away -- there's no reason to pre-set a fallback timer:

```typescript
const handleWalletDeepLink = (walletType: 'phantom' | 'solflare' | 'backpack') => {
  setSelectedWalletType(walletType);
  setDialogOpen(false);
  const deepLink = getWalletDeepLink(walletType);
  window.location.href = deepLink;
  // REMOVED: premature 1.5s timeout that showed fallback panel
};
```

### 4. `src/components/ConnectWalletGate.tsx` -- Same auto-connect polling
Add the same polling auto-connect logic so that when the site loads inside a wallet browser, the connection is established automatically regardless of which connect component renders first.

### 5. `src/components/MobileWalletFallback.tsx` -- Better messaging
Change the helper text from a vague "try tapping Connect again" to actionable guidance: add a prominent "Connect Now" button that calls `connect()` directly, so users who land back on this screen have a one-tap fix.

## What Users Will See After Fix
- **Android**: Tapping a wallet button gives the MWA 15 seconds to complete (enough for slow devices). If user opens via deep link into wallet browser, the site auto-connects within ~1-3 seconds without any error message.
- **iOS**: Opening in wallet browser auto-connects within ~1-3 seconds. No more confusing fallback panel.
- **Both platforms**: If auto-connect truly fails, the fallback panel now has a clear "Connect Now" button instead of vague instructions.

## Files Changed
1. `src/components/WalletButton.tsx` -- increase timeout, polling auto-connect, remove premature fallback timer
2. `src/components/ConnectWalletGate.tsx` -- add polling auto-connect for wallet browser
3. `src/components/MobileWalletFallback.tsx` -- add "Connect Now" button, improve messaging
