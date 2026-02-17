

# Fix: "Buy with Card" Button Does Nothing (Root Cause Found)

## Problem

Two bugs prevent the Buy with Card button from working:

1. **`usePrivySolBalance.ts` missing App ID fallback**: Line 6 uses `import.meta.env.VITE_PRIVY_APP_ID` without the hardcoded fallback that every other file has. Since the env var is not set in the build, this hook returns early with `isPrivyUser: false` and `walletAddress: null`. The Add Funds page then thinks the user is NOT a Privy user and calls `login()` instead of `fundWallet()`, producing the "already logged in" error.

2. **Privy console warning about missing Solana connectors**: The PrivyProvider config enables Solana embedded wallets but does not configure `externalWallets.solana.connectors`. This produces the console warning. However, adding `externalWallets` previously caused an `onMount` crash, so the safe fix is to explicitly set `externalWallets: { solana: { connectors: [] } }` or skip it entirely if it triggers the crash again.

## Changes

### 1. `src/hooks/usePrivySolBalance.ts` (line 6) -- Critical Fix

Add the hardcoded fallback to match all other files:

```
// Before:
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

// After:
const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "cmlq6g2dn00760cl2djbh9dfy";
```

This single change will make `isPrivyUser` return `true` for logged-in users, which means `handleBuyOrLogin` will correctly call `fundWallet()` instead of `login()`.

### 2. `src/pages/AddFunds.tsx` (line 44-50) -- Guard against double-login

Add a check for `authenticated` before calling `login()` to prevent the "already logged in" error as a safety net:

```typescript
const handleBuyOrLogin = async () => {
  if (isPrivyUser && walletAddress) {
    await handleBuyWithCard();
  } else if (authenticated) {
    // User is logged in but wallet not detected yet -- try fundWallet with fallback
    toast.info("Loading your wallet... please try again in a moment.");
  } else {
    login();
  }
};
```

This requires importing `usePrivy` to get the `authenticated` flag.

### 3. `src/components/PrivyProviderWrapper.tsx` -- Suppress Solana connectors warning

Attempt to add `externalWallets: { solana: { connectors: [] } }` to the PrivyProvider config. If this causes the `onMount` crash (as noted in project history), revert and leave the warning as cosmetic-only.

## Impact

| File | Change |
|------|--------|
| `src/hooks/usePrivySolBalance.ts` | Add fallback App ID (1 line) |
| `src/pages/AddFunds.tsx` | Guard `login()` call with `authenticated` check |
| `src/components/PrivyProviderWrapper.tsx` | Add empty Solana connectors array (if safe) |

## Why This Fixes It

The root cause chain is:
1. `VITE_PRIVY_APP_ID` env var is empty in the build
2. `usePrivySolBalance` returns `isPrivyUser: false`
3. `handleBuyOrLogin` calls `login()` instead of `fundWallet()`
4. Privy SDK throws "already logged in" error
5. Button appears to do nothing

After fix: `isPrivyUser` will be `true`, `walletAddress` will be populated, and clicking "Buy with Card" will correctly call `fundWallet()`.

