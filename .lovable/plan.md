
# Fix: Wallet Selection Not Connecting

## Root Cause Analysis

The user flow shows:
1. Click "Create Room" → "Select Wallet" → "Phantom"
2. Dialog closes, but user returns to "Connect Wallet" page
3. Console shows: `connected: false, adapterName: "Phantom"`

**The problem:** `ConnectWalletGate.tsx` calls `select()` but never calls `connect()`.

With `autoConnect={false}` in `SolanaProvider.tsx`, the `select()` function only **sets the active adapter** - it does NOT trigger an actual connection. An explicit `connect()` call is required.

## Current Broken Code

```typescript
// ConnectWalletGate.tsx - lines 116-133
const handleSelectWallet = (walletId: string) => {
  const matchingWallet = wallets.find(w => 
    w.adapter.name.toLowerCase().includes(walletId)
  );
  
  if (matchingWallet) {
    select(matchingWallet.adapter.name);  // ❌ Only selects adapter
    setDialogOpen(false);                  // ❌ Closes dialog immediately
    // ❌ Never calls connect() - wallet never actually connects!
  }
  // ...
};
```

## Solution

Update `ConnectWalletGate.tsx` to call `connect()` after `select()`:

```typescript
// Add connect to useWallet hook
const { wallets, select, connect, connecting } = useWallet();

// Update handleSelectWallet
const handleSelectWallet = async (walletId: string) => {
  const matchingWallet = wallets.find(w => 
    w.adapter.name.toLowerCase().includes(walletId)
  );
  
  if (matchingWallet) {
    try {
      select(matchingWallet.adapter.name);
      setDialogOpen(false);
      
      // ✅ Actually connect to the wallet after selecting
      await connect();
    } catch (err) {
      console.error('[ConnectWalletGate] Connect error:', err);
      // Handle connection failure gracefully
      if (isMobile) {
        setNotDetectedWallet(walletId as 'phantom' | 'solflare' | 'backpack');
      } else {
        toast.error(`Failed to connect to ${walletId}. Please try again.`);
      }
    }
  } else if (isMobile) {
    // ... existing mobile fallback
  } else {
    toast.error(`${walletId} wallet not detected.`);
  }
};
```

## File Changes

| File | Change |
|------|--------|
| `src/components/ConnectWalletGate.tsx` | Add `connect` to useWallet hook and call it after `select()` |

## Technical Details

### Why WalletButton Works (Sometimes)

`WalletButton.tsx` has this auto-sync effect (lines 377-401):

```typescript
useEffect(() => {
  if (!isInWalletBrowser) return;
  if (win.solana?.isConnected && win.solana?.publicKey) {
    select(installedWallet.adapter.name);
    connect();  // ← It calls connect() here
  }
}, []); // Runs once on mount
```

But this only runs on **mount** in a **wallet browser** environment. It doesn't help when:
- User clicks a wallet button manually
- User is on desktop browser
- User is not in an in-app wallet browser

### The Standard Pattern

Per Solana wallet adapter docs, the correct connection flow is:
1. `select(walletName)` - Choose which adapter to use
2. `connect()` - Actually trigger the connection

With `autoConnect={true}`, step 2 happens automatically after step 1. But this project has `autoConnect={false}` (for reliability on mobile), so both steps must be explicit.

## Expected Behavior After Fix

1. Click "Create Room" → "Select Wallet" → "Phantom"
2. `select("Phantom")` is called
3. `connect()` is called immediately after
4. Phantom popup appears asking user to approve connection
5. On success: wallet shows as connected, user can create room
6. On failure/cancel: User stays on page with error toast
