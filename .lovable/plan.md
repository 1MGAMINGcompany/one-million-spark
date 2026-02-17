

# Add "Buy with Card" Using Privy's Built-In Funding (No Registration Needed)

## The Good News

Privy already includes a built-in fiat on-ramp that works under **Privy's merchant account** -- you do NOT need to register your company with MoonPay, Coinbase, or anyone else. You just:

1. Go to the **Privy Dashboard** (dashboard.privy.io) -> your app -> **Funding** tab
2. Enable **"Card"** (this enables credit/debit card, Apple Pay, Google Pay)
3. Optionally enable **"Coinbase"** (transfer from Coinbase account)
4. Set default chain to **Solana** and a default amount (e.g. 0.05 SOL)
5. Save

That's it on the Privy side. Then we add a single button in the app.

## What We Build

### Step 1: Add a "Buy with Card" button to AddSolCard

**File: `src/components/AddSolCard.tsx`**

- Import `useFundWallet` from `@privy-io/react-auth/solana`
- Add a big, prominent **"Buy with Card"** button at the TOP of the card (before the QR code)
- When clicked, call `fundWallet({ address: walletAddress })` -- Privy opens its own modal with card payment, Apple Pay, Google Pay options
- The user pays, SOL arrives in their wallet, the existing balance polling detects it, confetti fires
- Move the QR code and "send SOL" instructions into a collapsible "Already have SOL?" section below

The user experience becomes:
```
+----------------------------------+
|     Add Balance to Play          |
|                                  |
|  [  Buy with Card / Apple Pay  ] |  <-- One big button, Privy handles the rest
|                                  |
|  v Already have crypto? (expand) |
|    [QR code] [wallet address]    |
+----------------------------------+
```

### Step 2: Add "Buy with Card" to AddFunds page

**File: `src/pages/AddFunds.tsx`**

- For Privy users: add the same `fundWallet` button prominently at the top
- Keep the AddSolCard below for reference
- Replace crypto-heavy language with "Add balance with your card"

### Step 3: Add quick-fund nudge on CreateRoom insufficient balance

**File: `src/pages/CreateRoom.tsx`**

- When a user tries to create a room but has insufficient SOL, instead of just a toast, show a dialog with a "Add Funds Now" button that calls `fundWallet` directly
- This keeps them in the flow -- they fund, then immediately create the room

### Step 4: Simplify language across the app

**Files: `src/i18n/locales/en.json` (and other locale files)**

Key label changes:
- "Add SOL" -> "Add Balance"  
- "Buy SOL in Phantom" -> "Buy with Card" (as the primary option)
- "Wallet address" -> kept only in the advanced/collapsible section
- "Entry Fee (SOL)" -> show USD first: "$2.50 (~0.017 SOL)"
- "Waiting for SOL..." -> "Waiting for payment..."

## Technical Details

### The `useFundWallet` Hook

```text
import { useFundWallet } from '@privy-io/react-auth/solana';

const { fundWallet } = useFundWallet();

// Call when user clicks "Buy with Card"
await fundWallet({
  address: walletAddress,    // Privy embedded wallet address
  options: {
    cluster: { name: 'mainnet-beta' }
  }
});
```

- Privy opens its own modal overlay
- User sees card payment / Apple Pay / Google Pay options
- MoonPay or Coinbase processes the payment under Privy's account
- SOL arrives in the user's wallet (may take 1-5 minutes)
- Our existing balance polling in `usePrivySolBalance` detects the new balance and triggers confetti

### What You Need to Do in Privy Dashboard (Before This Works)

1. Go to **dashboard.privy.io** -> Select your app
2. Go to **Funding** settings
3. Enable **"Pay with card"** (and optionally "Transfer from Coinbase")
4. Set default chain to **Solana**
5. Set a default funding amount (e.g., 0.05 SOL)
6. Save

No API keys, no merchant registration, no company paperwork.

### Files Changed

| File | Change |
|------|--------|
| `src/components/AddSolCard.tsx` | Add `fundWallet` button as primary action, move QR to collapsible |
| `src/pages/AddFunds.tsx` | Add fund button for Privy users at top |
| `src/pages/CreateRoom.tsx` | Add "Add Funds Now" dialog on insufficient balance |
| `src/i18n/locales/en.json` | Friendlier labels (Add Balance, Buy with Card, etc.) |

### No Backend Changes

- No database changes
- No edge functions
- No new dependencies (useFundWallet is already in the installed `@privy-io/react-auth` package)

