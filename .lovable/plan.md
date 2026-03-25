

# Fix: Prediction Approval Timeout on Polymarket Events

## Problem
When placing a prediction on the Polymarket-connected boxing event, the USDC.e approval step times out with "Approval confirmation timed out — try again". The swap worked fine, so the user has $2.44 USDC.e but cannot proceed to submit.

## Root Cause
Two issues in the approval confirmation flow:

1. **Smart Wallet vs EOA address mismatch**: `usePrivyWallet` returns the Smart Wallet address (ERC-4337 proxy), but `useSendTransaction` may execute from either the Smart Wallet or the embedded EOA. The polling only checks ONE address, missing the approval if it lands on the other.

2. **Double-polling with insufficient timeout**: `usePrivyFeeTransfer.approveFeeAllowance()` polls for 20s (10×2s). If it doesn't detect the allowance, it returns `success: false` with error `allowance_not_confirmed_after_20s`. The `useAllowanceGate` then shows "Approval confirmation timed out" immediately — it never gets to its own 30s polling phase. Smart Wallet UserOperations on Polygon can take 30-60s to confirm.

## Plan

### 1. Fix `usePrivyFeeTransfer` — dual-address polling + longer timeout
- Get both Smart Wallet and EOA addresses from Privy's `useWallets` and `usePrivy`
- Poll allowance on BOTH addresses in each attempt
- Increase from 10 to 20 attempts (40s total) to accommodate slow bundler inclusion

### 2. Fix `useAllowanceGate` — dual-address check + skip redundant polling
- Read both Smart Wallet and EOA addresses
- In `readOnChainAllowance`, check both and return the higher value
- When `approveFeeAllowance()` returns success (already confirmed), skip the second polling loop entirely
- Increase polling to 20 attempts for the fallback path

### 3. Fix `usePrivyWallet` — expose both addresses
- Add an `eoaAddress` field alongside `walletAddress` (which is the Smart Wallet)
- This allows the allowance hooks to poll both addresses without duplicating Privy hook logic

## Files Changed
- `src/hooks/usePrivyWallet.ts` — expose `eoaAddress`
- `src/hooks/usePrivyFeeTransfer.ts` — dual-address polling, longer timeout
- `src/hooks/useAllowanceGate.ts` — dual-address check, skip redundant polling

