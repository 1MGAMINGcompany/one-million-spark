

## Plan: Safe Payout Wallet Auto-Heal + Demo Ownership Bind

### A) Demo DB Update

Update the `demo` operator record to bind your real Privy identity and wallet:

```sql
UPDATE operators
SET user_id = 'did:privy:cmlqvouen00te0clhp5wog5ke',
    payout_wallet = '0x3ed68845cf4528c80ff62094b52eeabca29db5a4'
WHERE subdomain = 'demo';
```

### B) Auto-Set Payout Wallet Code Change

In `src/components/operator/OperatorEarningsTab.tsx`:

1. Add `walletAddress` prop (the logged-in user's Privy EVM wallet) and `operatorUserId` prop (the operator's `user_id` from the DB)
2. After `fetchSweepData` returns, add a one-time `useEffect`:

```ts
useEffect(() => {
  if (data && !data.payout_wallet && walletAddress && operatorUserId === loggedInUserId) {
    // Auto-set payout wallet silently
    autoSetPayoutWallet(walletAddress);
  }
}, [data, walletAddress, operatorUserId, loggedInUserId]);
```

In `src/pages/platform/OperatorDashboard.tsx`:

3. Pass the additional props from the dashboard, which already has access to the operator record and the Privy user:

```tsx
<OperatorEarningsTab
  operatorId={operator.id}
  operatorUserId={operator.user_id}              // NEW
  loggedInUserId={user?.id || ""}                 // NEW — Privy DID
  walletAddress={walletAddress}                   // NEW — from usePrivyWallet
  getAccessToken={getAccessToken}
/>
```

### C) Safety Condition (Prevents Ownership Changes)

The auto-set logic has this exact guard:

```
if operator.user_id === logged-in Privy DID
  AND payout_wallet is null
  AND walletAddress exists
  → call set_payout_wallet
```

- `user_id` is **never modified** by this code
- Only `payout_wallet` is updated
- If the logged-in user does NOT match the operator owner, nothing happens

### D) Silvertooth Binding Process (Later, Manual)

1. The Silvertooth person visits 1mg.live and logs in with Privy (using their email)
2. Privy creates their embedded wallet automatically
3. You (or I) capture their real Privy DID and wallet address from the `prediction_accounts` table
4. Run a one-time explicit DB update:
   ```sql
   UPDATE operators
   SET user_id = '<their-real-privy-did>',
       payout_wallet = '<their-real-wallet>'
   WHERE subdomain = 'silvertooth';
   ```
5. After that, the auto-heal logic covers any future wallet changes

### Files Changed

| File | Change |
|------|--------|
| DB migration | Update `demo` operator `user_id` + `payout_wallet` |
| `OperatorEarningsTab.tsx` | Add auto-set payout wallet with ownership guard |
| `OperatorDashboard.tsx` | Pass `operatorUserId`, `loggedInUserId`, `walletAddress` props |

