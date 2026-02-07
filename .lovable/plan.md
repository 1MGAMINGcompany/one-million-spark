# Solflare In-App Browser Auto-Connect Fix

**Status: ✅ IMPLEMENTED**

## Problem
When scanning QR with Solflare mobile, wallet failed to auto-connect because:
1. Explicit `SolflareWalletAdapter` meant `wallets.length` was always 1
2. `autoConnectAttemptedRef` blocked re-attempts when `readyState` changed
3. No native `autoConnect` was enabled for wallet browsers

## Solution Applied

### SolanaProvider.tsx
- Added `getIsInWalletBrowser()` detection function
- Enabled native `autoConnect={shouldAutoConnect}` when in wallet browser
- Wallet adapter library now handles connection automatically

### WalletButton.tsx  
- Replaced `autoConnectAttemptedRef` guard with reactive dependency
- Added `installedWalletsKey` computed from installed wallet adapters
- Effect now re-runs when adapter `readyState` transitions to `'Installed'`

## Expected Flow
1. User scans QR → Solflare opens in-app browser
2. `SolanaProvider` detects wallet browser → sets `autoConnect={true}`
3. Wallet adapter library handles native auto-connect
4. If native fails, `WalletButton` effect detects `installedWalletsKey` change
5. Effect tries `select()` + `connect()`
6. Connection succeeds → user can join game

## Verification
1. Scan QR code with Solflare mobile
2. Verify wallet auto-connects within 2-3 seconds
3. Verify "Connected" state in navbar
4. Join a room successfully
5. Test same flow with Phantom to ensure no regression
