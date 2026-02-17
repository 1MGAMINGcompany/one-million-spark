

# Fix: Make "Buy with Card" Button Always Visible on Add Funds Page

## Problem

The Add Funds page has two render paths:
- **Privy branch** (`isPrivyUser && walletAddress`): Shows the AddSolCard which HAS the "Buy with Card" button
- **Default branch** (everyone else): Shows informational steps about wallets and payment methods but NO actionable button

When the Privy wallet address loads slowly, or on certain mobile webviews, the user lands on the default branch and sees no way to buy -- just text about payment methods with no actual button to click.

## Solution

Add a large, prominent "Buy with Card" button to the **default (non-Privy) view** in the Step 2 section of `AddFunds.tsx`. The button behavior:
- If the user has a Privy wallet (`isPrivyUser && walletAddress`): calls `fundWallet()` directly
- If not logged in: calls Privy `login()` to prompt signup first, then the page re-renders with the Privy view

Also add a standalone "Buy with Card" button near the TOP of the default view (above the steps) so it's immediately visible without scrolling.

## File Changes

### `src/pages/AddFunds.tsx`

1. Import `useLogin` from `@privy-io/react-auth`
2. Create a `handleBuyOrLogin` function that either calls `fundWallet` (if Privy wallet exists) or `login()` (if not authenticated)
3. Add a prominent "Buy with Card" button at the top of the default view, right after the SOL price display
4. Add the same button inside the Step 2 section, after the payment method badges (replacing the dead-end text)
5. Both buttons are large (size="lg"), full-width, with the CreditCard icon -- impossible to miss

### What the user sees (both logged in and logged out):

```text
  ADD FUNDS
  Adding funds is easy!

  SOL Price: $85.08

  [====  Buy with Card  ====]   <-- NEW: always visible, top of page
  Credit Card | Apple Pay | Google Pay

  --- Step 1: Get a Wallet ---
  ...
  --- Step 2: Buy SOL ---
  [====  Buy with Card  ====]   <-- NEW: also here in the step
```

If not logged in, clicking the button prompts Privy login. After login, the page re-renders with the Privy view showing AddSolCard with balance and the same button.
