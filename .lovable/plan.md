

# Make Privy the Default Login, External Wallets as Advanced Option

## Problem
Both the Privy embedded wallet and the Phantom browser extension wallet are showing simultaneously in the navbar. External wallets auto-connect on page load, creating a confusing dual-wallet experience.

## Changes

### 1. Disable External Wallet Auto-Connect
**File: `src/components/SolanaProvider.tsx`**
- Change `autoConnect={true}` to `autoConnect={false}`
- This prevents Phantom/Solflare/Backpack from reconnecting automatically on page load

### 2. Remove Mobile Auto-Connect Polling
**File: `src/components/WalletButton.tsx`**
- Remove or disable the auto-connect polling logic (lines 366-395) that tries to detect and auto-connect injected wallet providers on mobile
- External wallets should only connect when the user explicitly clicks the connect button

### 3. Restructure Navbar Wallet Display
**File: `src/components/Navbar.tsx`**
- Make `PrivyLoginButton` the primary and prominent login element
- Move `WalletButton` (external wallets) into a collapsible "Advanced" section using the Collapsible component from Radix UI
- The collapsible section is collapsed by default with a small "Advanced: External Wallet" toggle
- When a Privy user is authenticated, the external wallet section remains available but de-emphasized
- On mobile, same pattern: Privy first, external wallet in collapsed Advanced section

### 4. Update WalletButton to Not Show as Primary
**File: `src/components/WalletButton.tsx`**
- When an external wallet is connected, it will only appear inside the Advanced section (not as the primary wallet display in the navbar)
- The connected state UI (address chip + balance + disconnect) stays the same but is contained within the collapsible

## Technical Details

### SolanaProvider.tsx
```
autoConnect={false}  // was true
```

### WalletButton.tsx - Remove auto-connect polling
The useEffect at lines 366-395 that polls for injected providers and auto-connects will be removed.

### Navbar.tsx - Layout change
Desktop layout becomes:
```
[Nav Items] [Sound] [Bell] [PrivyLoginButton] [Collapsible: "External Wallet" -> WalletButton]
```

Mobile layout becomes:
```
[Nav Items]
[Privy Login]
[Collapsible: "Advanced: Connect External Wallet" -> WalletButton]
```

The collapsible uses the existing `@radix-ui/react-collapsible` package already installed.

## What Does NOT Change
- No game logic, timers, or session token changes
- No Solana program code changes
- No Supabase function changes
- External wallets still fully work when explicitly connected
- The WalletButton component internals (connect flow, deep links, etc.) remain intact

