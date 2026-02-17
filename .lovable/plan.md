

# Fix: "Buy with Card" Button Does Nothing

## Root Cause

The `fundWallet()` call uses the wrong options format. The code currently passes:

```text
options: { chain: "solana:mainnet", amount: "0.05" }
```

But the Privy SDK expects:

```text
options: { cluster: { name: "mainnet-beta" }, amount: "0.05" }
```

The incorrect `chain` property is silently ignored, causing `fundWallet` to fail without any visible error (the catch block only does `console.warn`).

This affects BOTH the `AddSolCard.tsx` button AND the `AddFunds.tsx` button -- they both have the same bug.

## Fix

### 1. `src/components/AddSolCard.tsx` (line ~40)

Change the `fundWallet` call options from:
```text
options: { chain: "solana:mainnet", amount: "0.05" }
```
to:
```text
options: { cluster: { name: "mainnet-beta" }, amount: "0.05" }
```

### 2. `src/pages/AddFunds.tsx` (line ~29)

Same fix -- change `chain: "solana:mainnet"` to `cluster: { name: "mainnet-beta" }`.

### 3. Add user-visible error feedback

Both files currently swallow errors with `console.warn`. Add a `toast.error()` so if the funding modal still fails to open, the user sees a message instead of nothing happening.

## Files Changed

| File | Change |
|------|--------|
| `src/components/AddSolCard.tsx` | Fix `fundWallet` options format, add toast on error |
| `src/pages/AddFunds.tsx` | Fix `fundWallet` options format, add toast on error |

## Important Note

The Privy funding modal may still not open on the Lovable preview domain -- it only works on your whitelisted production domain (1mgaming.com). But with this fix, clicking the button on production will correctly open the Privy card payment modal.

