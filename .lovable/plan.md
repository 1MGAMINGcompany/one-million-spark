
# Fix: Solflare In-App Browser Auto-Connect Loop

## Problem Analysis

When users open a QR invite link in Solflare's in-app browser, the wallet doesn't auto-connect like Phantom does. The current behavior:
1. User scans QR → Solflare opens the Room page
2. Wallet not connected → WalletGateModal shows "Connect Wallet" button
3. User clicks → Opens connect dialog 
4. Nothing happens → Dialog closes → Still disconnected → Loop

### Root Causes

1. **Incomplete Solflare Detection**: The current `getIsInWalletBrowser()` only checks `win.solflare?.isSolflare`, but Solflare's in-app browser may inject the provider differently (e.g., via `window.Solflare` or `window.solana.isSolflare`)

2. **Auto-Connect Logic Issues**: The current retry loop looks for any "Installed" adapter but doesn't specifically target Solflare's adapter in Solflare browser. It also stops retrying too early when `win.solana` exists but the wallet-adapter isn't ready.

3. **No Connect Loop Guard**: If auto-connect fails, the Room page can repeatedly trigger the WalletGateModal, creating a poor UX loop.

---

## Solution Overview

### 1. Improve Solflare In-App Browser Detection

Add comprehensive Solflare detection in `WalletButton.tsx`:

```typescript
// Specific Solflare in-app browser detection
const getIsSolflareBrowser = () => {
  const win = window as any;
  const ua = (navigator.userAgent || '').toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  
  // Explicit Solflare flags
  const hasSolflareInAppFlag = !!win.solflare?.isInAppBrowser;
  const hasSolflareIsSolflare = !!win.solflare?.isSolflare;
  const hasWindowSolflare = !!win.Solflare;
  
  // window.solana may have Solflare flags
  const solanaIsSolflare = !!win.solana?.isSolflare || !!win.solana?.isSolflareWallet;
  
  // UA-based detection (Solflare includes its name in UA)
  const solflareInUA = ua.includes('solflare');
  
  // In-app browser = mobile + Solflare provider present
  return isMobile && (
    hasSolflareInAppFlag ||
    hasSolflareIsSolflare ||
    hasWindowSolflare ||
    solanaIsSolflare ||
    solflareInUA
  );
};
```

### 2. Wallet-Specific Auto-Connect Logic

Modify the auto-connect `useEffect` in `WalletButton.tsx` to:
- Detect which wallet browser we're in (Phantom vs Solflare)
- Select the appropriate adapter by name match
- Retry more aggressively for Solflare (which may take longer to inject)
- Don't rely on `window.solana.isConnected` for Solflare

```typescript
// In auto-connect effect:
const tryConnect = async () => {
  const win = window as any;
  attempts++;
  
  // Determine which wallet browser we're in
  const isPhantomBrowser = !!win.phantom?.solana?.isPhantom && isMobile;
  const isSolflareBrowser = getIsSolflareBrowser();
  
  // Find preferred adapter based on browser
  let preferredAdapter = null;
  if (isSolflareBrowser) {
    preferredAdapter = wallets.find(w => 
      w.adapter.name.toLowerCase().includes('solflare') &&
      w.readyState === 'Installed'
    );
  } else if (isPhantomBrowser) {
    preferredAdapter = wallets.find(w => 
      w.adapter.name.toLowerCase().includes('phantom') &&
      w.readyState === 'Installed'
    );
  }
  
  // Fallback to any installed adapter
  const targetAdapter = preferredAdapter || 
    wallets.find(w => w.readyState === 'Installed');
  
  if (targetAdapter) {
    try {
      select(targetAdapter.adapter.name);
      await connect();
      console.log("[WalletBrowser] Auto-connect succeeded:", targetAdapter.adapter.name);
      return true; // Success - stop retrying
    } catch (err) {
      console.warn("[WalletBrowser] Auto-connect attempt failed:", err);
    }
  }
  
  // For Solflare: also try direct provider connect
  if (isSolflareBrowser && win.solflare?.connect) {
    try {
      await win.solflare.connect();
      console.log("[WalletBrowser] Direct solflare.connect() succeeded");
      return true;
    } catch (err) {
      console.warn("[WalletBrowser] Direct solflare.connect() failed:", err);
    }
  }
  
  return false; // Continue retrying
};
```

### 3. Prevent Connect Modal Loop on Room Page

Add a guard in `Room.tsx` to prevent repeated modal opening in wallet browsers:

```typescript
// Add ref to track if we've already prompted
const hasAutoPromptedConnectRef = useRef(false);

// In useEffect that handles wallet state
useEffect(() => {
  // In wallet browser: don't auto-show modal, let auto-connect handle it
  if (inWalletBrowser && !isConnected) {
    // Give auto-connect time to work before showing any prompt
    if (hasAutoPromptedConnectRef.current) return;
    
    const timer = setTimeout(() => {
      if (!isConnected && !hasAutoPromptedConnectRef.current) {
        hasAutoPromptedConnectRef.current = true;
        // Optionally show a toast instead of modal
        toast.info("Connecting wallet...");
      }
    }, 3000); // Wait for auto-connect to complete
    
    return () => clearTimeout(timer);
  }
}, [inWalletBrowser, isConnected]);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/WalletButton.tsx` | Add `getIsSolflareBrowser()` detection, update auto-connect effect to prefer Solflare adapter in Solflare browser, add direct `solflare.connect()` fallback |
| `src/pages/Room.tsx` | Add `hasAutoPromptedConnectRef` guard to prevent modal loop in wallet browsers |

---

## Detection Confirmation

After implementation, Solflare will be detected via:

```typescript
const isSolflareBrowser = 
  !!win.solflare?.isInAppBrowser ||   // Explicit flag
  !!win.solflare?.isSolflare ||       // Provider flag
  !!win.Solflare ||                   // Capital-S variant
  !!win.solana?.isSolflare ||         // On window.solana
  !!win.solana?.isSolflareWallet ||   // Alt flag
  ua.includes('solflare');            // UA string
```

## Adapter Selection Confirmation

For Solflare browser, the adapter selection will:
1. First look for adapter with name containing "solflare" (case-insensitive)
2. Ensure it has `readyState === 'Installed'`
3. Fallback to any installed adapter if specific one not found

---

## Expected Behavior After Fix

1. User scans QR code → Solflare opens Room page
2. `getIsSolflareBrowser()` returns `true`
3. Auto-connect effect starts retry loop
4. Finds Solflare adapter by name → calls `select()` then `connect()`
5. Connection succeeds → wallet connected
6. If auto-connect fails after retries → single toast notification (not modal loop)
7. Pending route restoration works as before

---

## No Changes to Desktop

- `getIsSolflareBrowser()` only returns `true` when `isMobile === true`
- Desktop Solflare extension behavior unchanged
- Phantom detection unchanged
- QR link format unchanged (`/room/:roomPda`)
