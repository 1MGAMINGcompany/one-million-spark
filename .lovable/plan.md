

## Plan: Minimal fundWallet Asset Patch

### What
Change `asset: { erc20: USDC_NATIVE_FOR_ONRAMP as \`0x\${string}\` }` to `asset: 'USDC'` in all fundWallet calls.

### Files to Change

1. **`src/pages/AddFunds.tsx`** — `handleFundWallet` function, the `asset` property in the fundWallet options object
2. **`src/pages/platform/OperatorApp.tsx`** — equivalent fundWallet call, same `asset` property change

### What Changes
In both files, the single line:
```ts
asset: { erc20: USDC_NATIVE_FOR_ONRAMP as `0x${string}` },
```
becomes:
```ts
asset: 'USDC',
```

The `USDC_NATIVE_FOR_ONRAMP` import can be removed if it becomes unused.

Everything else stays identical: `chain: polygon`, `amount`, `card`, `defaultFundingMethod`, wallet address, gasless config.

### After Patching
Will verify:
- No other fundWallet calls still use raw ERC-20 object
- No TypeScript errors
- User should test on 1mg.live to confirm whether direct card flow opens

