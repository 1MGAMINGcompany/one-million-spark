
# Fix: Solflare In-App Browser Auto-Connect Not Working

## Problem Summary
When a user scans a QR invite link with Solflare mobile app:
1. Solflare opens the page in its in-app browser
2. The wallet does NOT auto-connect (unlike Phantom which works)
3. Clicking "Connect Wallet" button results in an error: "If connection didn't work, try tapping Connect again"
4. This creates a frustrating loop where the user can't connect

## Root Cause Analysis

### Issue 1: Wallet Standard Auto-Detection Timing
The current `SolanaProvider.tsx` uses:
```typescript
const wallets = useMemo(() => [], []);
```
This relies 100% on Wallet Standard auto-detection. However, Solflare's in-app browser may not register via the Standard API fast enough.

### Issue 2: Adapter Not Found During Auto-Connect
When the auto-connect effect runs (lines 428-582 in WalletButton.tsx):
```typescript
preferredAdapter = wallets.find(w => 
  w.adapter.name.toLowerCase().includes('solflare') &&
  w.readyState === 'Installed'
);
```
This often returns `undefined` because the `wallets` array from `useWallet()` hasn't populated with Solflare yet, even though `window.solflare` exists.

### Issue 3: Direct Provider Connect Success Doesn't Sync with Adapter
The fallback logic tries `win.solflare.connect()` directly, but even if it succeeds, the subsequent adapter operations fail because the adapter isn't in the list.

### Issue 4: Manual Connect Doesn't Retry with Direct Provider
When user clicks "Connect Wallet" in the dialog, `handleWalletClick()` only tries `select()` + `connect()` via the adapter. If the adapter isn't detected, it shows the fallback panel.

---

## Solution

### 1. Add Explicit Solflare Adapter (SolanaProvider.tsx)

Add the `SolflareWalletAdapter` explicitly to ensure it's always available, especially in mobile in-app browsers:

```typescript
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

const wallets = useMemo(() => [
  new SolflareWalletAdapter()
], []);
```

**Why this helps**: Even if Wallet Standard detection is slow, the explicit adapter will be available immediately. Duplicate adapters are automatically deduplicated by the wallet-adapter library.

### 2. Improve Solflare Auto-Connect with Direct Provider Fallback (WalletButton.tsx)

When in Solflare browser but no adapter found, try direct provider connect AND wait for adapter to appear:

```typescript
// If Solflare browser but no adapter found yet, try direct connect
if (isSolflareBrowser && !preferredAdapter) {
  const win = window as any;
  
  // Try direct provider connect first
  if (win.solflare?.connect) {
    try {
      const resp = await win.solflare.connect();
      if (resp?.publicKey) {
        console.log("[WalletBrowser] Direct solflare.connect() succeeded");
        // Now wait a tick for adapter to appear
        await new Promise(r => setTimeout(r, 100));
        
        // Re-check for adapter
        const newAdapter = wallets.find(w => 
          w.adapter.name.toLowerCase().includes('solflare') &&
          w.readyState === 'Installed'
        );
        
        if (newAdapter) {
          select(newAdapter.adapter.name);
          // Don't call connect() again - already connected via direct provider
          connectSucceeded = true;
          return true;
        }
      }
    } catch (err) {
      console.warn("[WalletBrowser] Direct solflare.connect() failed:", err);
    }
  }
}
```

### 3. Increase Retry Attempts and Add Delay for Solflare (WalletButton.tsx)

Solflare's in-app browser may take longer to inject its provider:

```typescript
const AUTO_CONNECT_MAX_TRIES = 15; // Increase from 10 to 15
const AUTO_CONNECT_RETRY_MS = 300; // Increase from 250 to 300
```

### 4. Add Solflare Direct Connect in Manual Click Flow (WalletButton.tsx)

When user clicks Solflare in the connect dialog and adapter isn't found, try direct provider:

```typescript
const handleWalletClick = (walletId: string) => {
  const matchingWallet = sortedWallets.find(w => 
    w.adapter.name.toLowerCase().includes(walletId)
  );
  
  if (matchingWallet) {
    // ... existing logic
  } else if (walletId === 'solflare' && getIsSolflareBrowser()) {
    // Special handling for Solflare in-app browser when adapter not found
    handleSolflareDirectConnect();
  } else if (isMobile) {
    // ... existing modal logic
  }
};

const handleSolflareDirectConnect = async () => {
  const win = window as any;
  setConnectingWallet('Solflare');
  setDialogOpen(false);
  
  try {
    if (win.solflare?.connect) {
      const resp = await win.solflare.connect();
      if (resp?.publicKey) {
        // Wait for wallet-adapter to sync
        await new Promise(r => setTimeout(r, 500));
        
        // Force a re-render by triggering connect again
        const adapter = wallets.find(w => 
          w.adapter.name.toLowerCase().includes('solflare')
        );
        if (adapter) {
          select(adapter.adapter.name);
          await connect();
        }
        return;
      }
    }
    throw new Error('Solflare connect failed');
  } catch (err) {
    console.error('[Wallet] Solflare direct connect failed:', err);
    setConnectingWallet(null);
    setShowFallbackPanel(true);
  }
};
```

### 5. Prevent Modal Loop in Room.tsx

Add check to not show WalletGateModal if we're in Solflare browser and auto-connect is still running:

```typescript
// Add state to track if auto-connect is in progress
const [autoConnectInProgress, setAutoConnectInProgress] = useState(false);

// In handleJoinButtonClick
if (!isConnected) {
  if (inWalletBrowser) {
    // Give auto-connect more time before showing modal
    if (!hasAutoPromptedConnectRef.current) {
      hasAutoPromptedConnectRef.current = true;
      toast.info("Connecting to wallet...", { duration: 3000 });
      // Don't show modal - auto-connect should handle it
      return;
    }
  }
  setShowWalletGate(true);
  return;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/SolanaProvider.tsx` | Add explicit `SolflareWalletAdapter` |
| `src/components/WalletButton.tsx` | Improve auto-connect timing, add direct connect handler for Solflare, increase retry attempts |
| `src/pages/Room.tsx` | Improve wallet gate logic for Solflare browser |

---

## Technical Details

### SolanaProvider.tsx Changes
```typescript
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

// In component:
const wallets = useMemo(() => [
  new SolflareWalletAdapter(),
], []);
```

### WalletButton.tsx Changes
1. Increase `AUTO_CONNECT_MAX_TRIES` to 15 and `AUTO_CONNECT_RETRY_MS` to 300
2. Add `handleSolflareDirectConnect()` function
3. Modify `handleWalletClick()` to call direct connect for Solflare in-app browser
4. Improve auto-connect effect to better handle Solflare timing

### Room.tsx Changes
1. Don't immediately show WalletGateModal in Solflare browser
2. Show toast instead giving auto-connect time to work

---

## Expected Behavior After Fix

1. User scans QR code with Solflare
2. Solflare opens in-app browser to room page
3. `SolflareWalletAdapter` is immediately available (explicit adapter)
4. Auto-connect effect detects Solflare browser
5. Calls `select('Solflare')` + `connect()` 
6. Connection succeeds
7. User can join the game

**Fallback if auto-connect fails:**
1. User clicks "Connect Wallet"
2. Solflare button shown with "Detected" badge
3. Click triggers direct `window.solflare.connect()`
4. Connection succeeds

---

## Verification Steps

1. Generate a QR code for a private room
2. Scan with Solflare mobile app
3. Verify wallet auto-connects within ~3 seconds
4. Verify you can join the game
5. Test the same flow with Phantom to ensure no regression
