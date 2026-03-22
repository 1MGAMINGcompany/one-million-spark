

## Plan: Enable Gas Sponsorship for USDC Approval Transaction

### Problem
The `usePrivyFeeTransfer` hook uses `useSmartWallets().client.sendTransaction()` — the old smart wallet SDK path. This doesn't utilize Privy's native gas sponsorship even though it's enabled in the dashboard. The `AA21 didn't pay prefund` error occurs because the smart wallet has no MATIC and no paymaster is attached.

### Fix (1 file)

**`src/hooks/usePrivyFeeTransfer.ts`**

Replace `useSmartWallets().client.sendTransaction()` with Privy's `useSendTransaction` hook from `@privy-io/react-auth`, passing `sponsor: true` to activate dashboard-configured gas sponsorship.

```typescript
// Before (broken — no gas sponsorship):
const { client } = useSmartWallets();
await client.sendTransaction({ to, data, value: 0n });

// After (sponsored):
import { useSendTransaction } from '@privy-io/react-auth';
const { sendTransaction } = useSendTransaction();
await sendTransaction({ to, data, value: 0 }, { sponsor: true });
```

This is a minimal 1-file change. The dashboard already has Polygon sponsorship enabled with $20 credits — we just need the SDK call to opt in.

