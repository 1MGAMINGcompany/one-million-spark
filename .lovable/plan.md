

# Fix All "Connect Wallet" Buttons to Use Privy + Improve Button Copy

## Problem

There are two separate issues:

1. **Wrong wallet flow on gated pages**: When you tap "Create Game Room" (or join a room) on mobile without being logged in, the app shows the old `ConnectWalletGate` component -- which opens Phantom/Solflare deep links. It should instead trigger the Privy login (Google, Apple, Email). This happens because these pages check `isConnected` from the `useWallet()` hook, which only checks the **external** Solana wallet adapter, not Privy authentication.

2. **"Continue" button is vague**: The Privy login button just says "Continue" which doesn't explain what it does. Similar apps (Tensor, Magic Eden, Jupiter) use labels like "Log in" or "Sign in with Google/Email" to make it clear.

## What Changes

### 1. Update `useWallet` hook to include Privy users

**File: `src/hooks/useWallet.ts`**

The `useWallet` hook currently only checks `@solana/wallet-adapter-react`. It needs to also check if the user is authenticated via Privy with an embedded Solana wallet. If either is connected, `isConnected` should be `true` and `address` should return the appropriate wallet address.

- Import `usePrivy` from `@privy-io/react-auth`
- Extract Privy Solana wallet address from `user.linkedAccounts`
- Return Privy address as fallback when external wallet is not connected
- Privy-authenticated users are considered "connected"

### 2. Replace `ConnectWalletGate` with Privy login on gated pages

**Files: `src/pages/CreateRoom.tsx`, `src/pages/JoinRoom.tsx`**

When a user is not connected, these pages currently show `ConnectWalletGate` (external wallet picker). Instead, they should show a `PrivyLoginButton` as the primary action, with the external wallet option available as a secondary/advanced option below.

- Replace `<ConnectWalletGate />` with `<PrivyLoginButton />` as the primary CTA
- Add a small collapsible "Advanced: Use external wallet" section below with the existing `ConnectWalletGate`
- Update hardcoded English text to use i18n keys

### 3. Fix `WalletGateModal` to use Privy login

**File: `src/components/WalletGateModal.tsx`**

This modal (used in Room.tsx) currently opens the Solana wallet adapter modal via `setVisible(true)`. It should instead trigger `login()` from Privy as the primary action.

- Import `usePrivy` and call `login()` as the primary action
- Keep external wallet connect as secondary option
- Replace hardcoded English strings with i18n keys

### 4. Fix `WalletRequired` component

**File: `src/components/WalletRequired.tsx`**

This component (used in RoomList.tsx) shows a static "connect wallet" message with no action button. Add a `PrivyLoginButton` as the CTA.

- Add `PrivyLoginButton` import and render it
- Replace hardcoded English strings with i18n keys

### 5. Change "Continue" to "Log in / Sign up" 

**Files: `src/components/PrivyLoginButton.tsx`, all locale files**

The "Continue" label is vague. Change it to "Log in / Sign up" which is clearer and matches industry patterns (Tensor uses "Sign In", Magic Eden uses "Log In").

- Change the `wallet.continue` i18n key from "Continue" to "Log in / Sign up"
- Update all 10 locale files with proper translations

### 6. Add missing i18n keys

**Files: all locale files**

Add translations for new strings used in the updated gated pages:
- `createRoom.connectWalletDesc` equivalent for Privy context
- `wallet.orUseExternal` -- "Or connect an external wallet"
- Updated `wallet.continue` -- "Log in / Sign up"

## Technical Details

### useWallet.ts changes
```typescript
// Add Privy awareness
import { usePrivy } from "@privy-io/react-auth";

// Inside hook:
const { authenticated, user } = usePrivy();
const privyWallet = user?.linkedAccounts?.find(a => a.type === "wallet" && a.chainType === "solana");
const privyAddress = privyWallet?.address;

// Return combined state:
const isConnected = connected || (authenticated && !!privyAddress);
const address = publicKey?.toBase58() ?? privyAddress ?? null;
```

This is wrapped with a guard for PRIVY_APP_ID similar to usePrivySolBalance.

### CreateRoom.tsx gate section
```
[Wallet Icon]
"Log in to Create a Room"
"Sign in with Google, Apple, or Email to get started."
[PrivyLoginButton]  <-- primary
[Collapsible: "Or connect an external wallet" -> ConnectWalletGate]
```

### Button label change
"Continue" becomes "Log in / Sign up" in all languages.

## What Does NOT Change
- No game logic, timers, room logic, Supabase functions, or Solana program code
- External wallet connection flow (ConnectWalletGate internals) stays identical
- Privy provider configuration unchanged
- No changes to how wallet addresses are used downstream in game/room logic

