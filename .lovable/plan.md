

# Fix: Privy Wallet Can't Create Rooms (Transaction Signing Bridge)

## The Problem

When you're logged in via Privy (Google/Apple/Email), the app correctly shows you as "connected" on the UI. But when you click "Create Room", the underlying `useSolanaRooms` hook fails because it gets `publicKey` and `sendTransaction` directly from `@solana/wallet-adapter-react` -- which knows nothing about your Privy embedded wallet.

In short: the UI gate was fixed, but the transaction-signing layer still only talks to external wallets.

## The Fix

Bridge the Privy embedded wallet's signing capabilities into the unified `useWallet` hook so that `useSolanaRooms` (and all other hooks/pages that need to sign transactions) can work with either wallet type transparently.

### Step 1: Enhance `useWallet` hook to expose Privy transaction methods

**File: `src/hooks/useWallet.ts`**

- Import `useWallets` and `useSignAndSendTransaction` from `@privy-io/react-auth/solana`
- When Privy is active and no external wallet is connected, construct a `PublicKey` from the Privy address
- Create a `sendTransaction` wrapper that uses Privy's `signAndSendTransaction` for Privy users
- Expose these as `publicKey` and `sendTransaction` in the returned object so downstream code works without changes

Key additions to the return value:
- `publicKey`: Falls back to Privy wallet PublicKey when external wallet isn't connected
- `sendTransaction`: Falls back to Privy's `signAndSendTransaction` when external wallet isn't connected
- `isPrivyWallet`: Boolean flag so callers can know which path is active (useful for debug logging)

### Step 2: Update `useSolanaRooms.tsx` to use the unified hook

**File: `src/hooks/useSolanaRooms.tsx`**

- Change `import { useWallet } from "@solana/wallet-adapter-react"` to `import { useWallet } from "@/hooks/useWallet"`
- Keep `useConnection` from `@solana/wallet-adapter-react` (connection is the same regardless)
- The `publicKey`, `sendTransaction`, `connected`, and `wallet` references will now automatically work for both Privy and external wallets

### Step 3: Update other critical files that directly import from wallet-adapter

These files also use `useWallet` from `@solana/wallet-adapter-react` and need updating to use the unified hook:

- `src/hooks/useSolanaNetwork.ts` -- balance fetching uses `publicKey`
- `src/components/GlobalActiveRoomBanner.tsx` -- checks `publicKey` for active room display
- `src/components/Navbar.tsx` -- checks wallet state for UI display
- `src/pages/Room.tsx` -- uses wallet for room interactions and transactions
- `src/pages/DebugJoinRoom.tsx` -- uses wallet for debug join flow
- `src/components/WalletButton.tsx` -- shows wallet status/address
- `src/components/RecoverFundsButton.tsx` -- needs wallet for fund recovery transactions

Each file: change `import { useWallet } from "@solana/wallet-adapter-react"` to `import { useWallet } from "@/hooks/useWallet"`, keeping `useConnection` imports from the adapter as-is.

## Technical Details

### useWallet.ts -- Privy Transaction Bridge

```text
useWallet()
  |
  +-- External wallet connected? --> Use @solana/wallet-adapter publicKey + sendTransaction
  |
  +-- Privy authenticated? --> Construct PublicKey from Privy address
                               Use Privy signAndSendTransaction as sendTransaction
                               
Return shape stays identical -- downstream code doesn't change.
```

The Privy `sendTransaction` wrapper will:
1. Get the Privy wallet from `useWallets()` (from `@privy-io/react-auth/solana`)
2. Serialize the transaction to bytes
3. Call `signAndSendTransaction({ transaction: bytes, wallet: privyWallet })`
4. Return the signature (matching the same interface as the adapter's `sendTransaction`)

### What Does NOT Change
- No game logic, timers, room state, Supabase functions, or on-chain program changes
- External wallet flow is completely untouched (it's the primary path when available)
- ConnectWalletGate internals stay the same
- The Privy provider configuration stays the same
- No new dependencies needed (`@privy-io/react-auth/solana` is already available in the installed package)

