

# Fix Cancel Buttons to Prompt Fund Recovery

## Problem

When a user creates a staked Quick Match room and presses "Cancel" (during searching or after timeout), `navigate(-1)` fires but nothing visible happens -- the user's SOL stays locked in the on-chain vault with no way to get it back from this screen.

## Solution

Replace the simple `navigate(-1)` cancel behavior with a recovery flow:

1. **Free games (stake = 0)**: Cancel navigates back immediately (no funds to recover).
2. **Staked games (stake > 0)**: Cancel triggers the existing `RecoverFundsButton` logic -- calls the `recover-funds` edge function, shows a confirmation dialog with the stake amount, user signs the cancel transaction, funds are returned, then navigates away.

## Changes

### File: `src/pages/QuickMatch.tsx`

1. **Import** `RecoverFundsButton` component (no -- actually we'll inline the recover logic to keep UX seamless, reusing the same edge function pattern from `RecoverFundsButton`).

   Actually, the simplest approach: for staked games, replace the cancel buttons with the existing `RecoverFundsButton` component, styled to match (ghost variant, full width). For free games, keep `navigate(-1)`.

   Better approach for cleaner UX: Add a `handleCancel` function that:
   - If `selectedStake === 0` or no `createdRoomPda`: just `navigate(-1)`
   - If staked + room created: call `recover-funds` edge function, show the `AlertDialog` confirmation, sign tx, then navigate away

2. **Add state**: `showRecoverDialog` (boolean), `recoverPendingTx` (string | null), `recoverStakeAmount` (string | null), `isRecovering` (boolean)

3. **Add `handleCancel` function**:
   - For free games or no room: `navigate(-1)`
   - For staked games: invoke `recover-funds` edge function with `roomPda` and `callerWallet`
   - On `can_cancel` response: show confirmation dialog
   - On `already_resolved`: toast and navigate away
   - On error: show toast, still allow navigate away

4. **Add `executeRecoverAndLeave` function**:
   - Deserialize unsigned tx from edge function response
   - User signs transaction
   - Send and confirm on-chain
   - Toast success, navigate away

5. **Add AlertDialog** for recovery confirmation (reuse exact pattern from `RecoverFundsButton`)

6. **Update both cancel buttons** (searching phase + timeout phase) to call `handleCancel` instead of `navigate(-1)`

7. **Add imports**: `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from UI components. Also `useConnection` from `@solana/wallet-adapter-react`, `Transaction` from `@solana/web3.js`, `bs58`.

### Localization (all 10 locale files)

Add new keys under `quickMatch`:

| Key | English |
|-----|---------|
| `recoverFunds` | "Cancel & Recover Funds" |
| `recoveringFunds` | "Recovering funds..." |
| `fundsRecovered` | "Room cancelled! Funds returned to your wallet." |
| `recoverConfirmTitle` | "Cancel Room & Recover Funds" |
| `recoverConfirmDesc` | "This will cancel the room and return your stake of {{amount}} SOL to your wallet. You will need to sign a transaction." |
| `confirmSign` | "Confirm & Sign" |

## Technical Details

- The `recover-funds` edge function already handles the `can_cancel` flow for waiting rooms with 1 participant -- which is exactly the Quick Match scenario (creator waiting, no opponent joined)
- The unsigned transaction is returned as a base58-encoded `Transaction`, deserialized, signed by the user, then sent on-chain
- For free games, no on-chain vault exists so we just navigate away
- This does NOT touch any game logic, settlement, forfeits, or timers

## Files Modified

| File | Change |
|------|--------|
| `src/pages/QuickMatch.tsx` | Add recover flow, AlertDialog, handleCancel function |
| `src/i18n/locales/en.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/es.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/ar.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/pt.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/fr.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/de.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/zh.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/it.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/ja.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/hi.json` | Add 6 new quickMatch keys |
