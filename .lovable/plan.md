
# Fix: Solflare In-App Browser Auto-Connect Not Working

## Root Cause Analysis

The issue was introduced when we added the explicit `SolflareWalletAdapter` to `SolanaProvider.tsx`. Here's why:

### Before the Change (It Worked)
- `wallets` array started empty (`[]`)
- Wallet Standard detected Solflare and added it to the array
- `wallets.length` changed from 0 → 1
- This triggered the auto-connect useEffect
- By this time, `readyState` was already `'Installed'`
- Connection succeeded

### After the Change (Broken)
- `wallets` array starts with 1 explicit adapter: `[SolflareWalletAdapter]`
- Auto-connect useEffect runs immediately (length = 1)
- But adapter's `readyState` is `'NotDetected'` because provider isn't injected yet
- `autoConnectAttemptedRef.current` is set to `true`
- Provider gets injected later, `readyState` becomes `'Installed'`
- But the effect never re-runs because:
  1. `wallets.length` is still 1 (no change)
  2. `readyState` isn't in the dependency array
  3. `autoConnectAttemptedRef` blocks re-attempts

### Direct Connect Problem
When user clicks "Connect Wallet" and we call `win.solflare.connect()`:
- The direct provider connects successfully
- But wallet-adapter-react doesn't know about it
- The React state (`connected`, `publicKey`) never updates
- User appears disconnected even though provider is connected

---

## Solution

### Option A: Fix the Dependency Issue (Recommended)
Change the auto-connect effect to depend on a computed value that changes when readyState changes:

```typescript
// Compute a "signature" that changes when installed wallets change
const installedWalletsSignature = wallets
  .filter(w => w.readyState === 'Installed')
  .map(w => w.adapter.name)
  .join(',');

useEffect(() => {
  // Same logic, but don't use autoConnectAttemptedRef at all
  // The dependency array handles deduplication
  if (!isInWalletBrowser) return;
  if (connected) return;
  
  // Try to connect...
}, [isInWalletBrowser, connected, installedWalletsSignature]);
```

### Option B: Remove the Ref Guard and Fix Dependencies
```typescript
useEffect(() => {
  if (!isInWalletBrowser) return;
  if (connected) return;
  
  // Find installed adapters
  const installedAdapter = wallets.find(w => 
    w.readyState === 'Installed' && 
    (getIsSolflareBrowser() 
      ? w.adapter.name.toLowerCase().includes('solflare')
      : true)
  );
  
  if (!installedAdapter) {
    // Not ready yet - effect will re-run when wallets change
    return;
  }
  
  // Connect immediately
  select(installedAdapter.adapter.name);
  connect();
  
}, [isInWalletBrowser, connected, wallets]); // wallets array reference changes when readyState changes
```

### Option C: Enable Native autoConnect for In-App Browsers
In `SolanaProvider.tsx`, enable `autoConnect` when in a wallet browser:

```typescript
const inWalletBrowser = useMemo(() => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /mobile|android|iphone/i.test(ua);
  if (!isMobile) return false;
  const win = window as any;
  return !!(win.phantom?.solana || win.solflare || win.Solflare);
}, []);

<WalletProvider 
  wallets={wallets} 
  autoConnect={inWalletBrowser} // Only auto-connect in wallet browsers
  onError={onError}
  localStorageKey="1m-gaming-wallet"
>
```

---

## Recommended Approach: Combine Options A + C

### 1. SolanaProvider.tsx
Enable native `autoConnect` when in a wallet in-app browser:

```typescript
// Detect wallet in-app browser synchronously at module level
const getIsInWalletBrowser = () => {
  if (typeof window === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
  if (!isMobile) return false;
  const win = window as any;
  return !!(
    win.phantom?.solana?.isPhantom ||
    win.solflare?.isSolflare ||
    win.solflare?.isInAppBrowser ||
    win.Solflare ||
    win.solana?.isSolflare
  );
};

// In component:
const shouldAutoConnect = useMemo(() => getIsInWalletBrowser(), []);

<WalletProvider 
  wallets={wallets} 
  autoConnect={shouldAutoConnect}  // Auto-connect in wallet browsers
  ...
>
```

### 2. WalletButton.tsx
Fix the dependency array to react to `readyState` changes:

```typescript
// Compute signature of installed wallets
const installedWalletsKey = wallets
  .filter(w => w.readyState === 'Installed')
  .map(w => w.adapter.name)
  .join(',');

useEffect(() => {
  if (!isInWalletBrowser) return;
  if (connected) return;
  
  // No longer use autoConnectAttemptedRef - the deps handle deduplication
  
  const isSolflareBrowser = getIsSolflareBrowser();
  const isPhantomBrowser = getIsPhantomBrowser();
  
  // Find the preferred installed adapter
  const preferredAdapter = isSolflareBrowser
    ? wallets.find(w => w.adapter.name.toLowerCase().includes('solflare') && w.readyState === 'Installed')
    : isPhantomBrowser
      ? wallets.find(w => w.adapter.name.toLowerCase().includes('phantom') && w.readyState === 'Installed')
      : wallets.find(w => w.readyState === 'Installed');
  
  if (!preferredAdapter) {
    // Not ready yet - will re-run when installedWalletsKey changes
    console.log('[WalletBrowser] No installed adapter yet, waiting...');
    return;
  }
  
  console.log('[WalletBrowser] Attempting auto-connect to:', preferredAdapter.adapter.name);
  select(preferredAdapter.adapter.name);
  connect();
  
}, [isInWalletBrowser, connected, installedWalletsKey, select, connect, wallets]);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/SolanaProvider.tsx` | Enable `autoConnect` when in wallet browser |
| `src/components/WalletButton.tsx` | Fix dependency array to react to readyState changes, remove blocking ref |

---

## Expected Flow After Fix

1. User scans QR → Solflare opens in-app browser
2. `SolanaProvider` detects wallet browser → sets `autoConnect={true}`
3. Wallet adapter library handles native auto-connect
4. If native fails, `WalletButton` effect detects `installedWalletsKey` change
5. Effect tries `select()` + `connect()`
6. Connection succeeds → user can join game

---

## Verification Steps

1. Scan QR code with Solflare mobile
2. Verify wallet auto-connects within 2-3 seconds
3. Verify "Connected" state in navbar
4. Join a room successfully
5. Test same flow with Phantom to ensure no regression

