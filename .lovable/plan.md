

## Diagnosis: Wallet Address Mismatch Causes Signature Verification Failure

### Root Cause

There is a **wallet address mismatch** between the SIWE message and the signing key:

1. `usePolymarketSession` gets `walletAddress` from `usePrivyWallet()` — which **prefers the smart wallet address** (ERC-4337 proxy, a contract address)
2. The SIWE message is built with this smart wallet address: `Wallet: 0x<smart_wallet>`
3. The `polymarket-auth` edge function receives `wallet: 0x<smart_wallet>`
4. In `FightPredictions.tsx`, `personal_sign` is executed by the **EOA embedded wallet** (`privyWallet.address` from `useWallets()`)
5. On the backend, `verifyMessage({ address: smart_wallet, signature: signed_by_EOA })` **always fails** because the smart wallet is a contract — it cannot produce verifiable `personal_sign` signatures

This explains why the edge function logs show only boot/shutdown with no `[polymarket-auth] CLOB API key derived` messages — it returns `{ error: "Signature verification failed" }` with status 401, which the frontend surfaces as a generic failure toast.

### Evidence
- `polymarket_user_sessions` table: **empty** (no session was ever created)
- `usePrivyWallet.ts` lines 48-52: prefers `smart_wallet` type from `linkedAccounts`
- `usePolymarketSession.ts` line 28: uses `walletAddress` from `usePrivyWallet` (smart wallet)
- `usePolymarketSession.ts` line 88: embeds smart wallet address in SIWE message
- `FightPredictions.tsx` lines 292-303: signs with EOA embedded wallet via `useWallets()`
- `polymarket-auth/index.ts` line 109-113: verifies signature against smart wallet address → **fails**

### Failing Path

```text
FightPredictions.handleSubmit
  → usePolymarketSession.deriveCredentials(signMessage)
    → builds message with smart wallet address
    → signs with EOA wallet
  → polymarket-auth edge function (derive_credentials)
    → verifyMessage(smart_wallet, signature_from_eoa) → false
    → returns { error: "Signature verification failed" }, 401
  → frontend catches → generic toast
```

### Fix (Smallest Safe Change)

**File: `src/hooks/usePolymarketSession.ts`**

The `walletAddress` used for SIWE signing and session lookup must be the **EOA embedded wallet address**, not the smart wallet. The smart wallet cannot produce verifiable personal signatures.

**Before** (line 28):
```typescript
const { walletAddress, isPrivyUser } = usePrivyWallet();
```

**After**: Import `useWallets` from Privy and resolve the EOA address explicitly for SIWE purposes, while keeping `usePrivyWallet` for the `isPrivyUser` check:

```typescript
const { isPrivyUser } = usePrivyWallet();
const { wallets } = useWallets();

// SIWE requires the EOA embedded wallet, not the smart wallet (contract can't sign)
const walletAddress = useMemo(() => {
  const privy = wallets.find((w) => w.walletClientType === "privy");
  return privy?.address?.toLowerCase() ?? null;
}, [wallets]);
```

Add imports: `useWallets` from `@privy-io/react-auth`, `useMemo` from `react`.

This ensures:
- The SIWE message contains the EOA address
- The backend verifies the signature against the EOA address
- The session is stored keyed to the EOA address
- The signing wallet and verification address match

No other files need changes — `FightPredictions.tsx` already signs with the EOA wallet, and `polymarket-auth` already normalizes whatever wallet it receives.

