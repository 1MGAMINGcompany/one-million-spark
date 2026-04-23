
## Silvertooth operator owner/linking fix plan

### What I found

The Silvertooth operator app exists in the backend as:

```text
Operator: SILVERTOOTH Promotions
Slug: silvertooth
Status: active
Support email: silvertoothpromo@gmail.com
Current owner user_id: platform-admin-silvertooth
Payout wallet: not set
```

The problem is that `platform-admin-silvertooth` is a manual placeholder owner ID, not the real Privy login ID created when the Silvertooth owner signed in.

The dashboard button is currently controlled here:

```text
src/pages/platform/OperatorApp.tsx
```

Logic:

```text
Show Dashboard button only if:
current logged-in Privy DID === operators.user_id
```

So when the Silvertooth owner logged in with `silvertoothpromo@gamil.com`, Privy created a real account with a real DID/wallet, but the Silvertooth operator row still belongs to:

```text
platform-admin-silvertooth
```

That is why:

```text
1. The Dashboard button did not appear.
2. The payout wallet did not auto-connect.
3. Admin still shows “wallet not connected.”
```

The payout wallet auto-set logic exists, but only after ownership is already correct:

```text
src/components/operator/OperatorEarningsTab.tsx
```

It only runs when:

```text
operator.user_id === loggedInUserId
```

Because Silvertooth ownership does not match the logged-in account, the auto-set never runs.

### Important note

The user typed:

```text
silvertoothpromo@gamil.com
```

The existing Silvertooth app record has:

```text
silvertoothpromo@gmail.com
```

Those are different emails. If the typo email was actually used, Privy may have created a separate identity. Before permanently linking, I will verify the latest Privy DID and wallet tied to the owner’s current login.

## Fix plan

### 1. Confirm the correct Silvertooth owner identity

Inspect the latest Privy-created identity/wallet records and match them against the owner’s recent login.

Current likely recent identity from backend activity:

```text
Privy DID: did:privy:cmobumj8901p00bjymj3gw8ck
Wallet: 0x3c50801bc8e0b411ed967a40423ae09ec8d914a9
```

But I will treat this as “likely” until verified, because the backend stores Privy DID/wallet but does not currently store the login email in the operator row.

### 2. Repair the Silvertooth operator row safely

Once the correct identity is confirmed, update only the Silvertooth operator record:

```text
operators.subdomain = silvertooth
```

Set:

```text
user_id = correct Silvertooth Privy DID
payout_wallet = correct Silvertooth EVM wallet
updated_at = now
```

This should immediately make:

```text
1mg.live/silvertooth → Dashboard button visible for the owner
/admin Operators tab → payout wallet connected
/dashboard → accessible for Silvertooth owner
```

No app content, events, fees, sports, purchases, or revenue records will be changed.

### 3. Add a backend-safe admin repair action

Update:

```text
supabase/functions/operator-manage/index.ts
```

Add an admin-only action:

```text
admin_link_operator_owner
```

It will accept:

```text
operator_id
owner_privy_did
payout_wallet
```

And atomically update:

```text
operators.user_id
operators.payout_wallet
operators.updated_at
```

Security rules:

```text
Only platform admins can call it.
Wallet must be valid 0x EVM address.
Operator must exist.
Action is logged to automation/admin activity logs.
```

This prevents future manual database edits and gives us a safe repair path if another operator account is provisioned with a placeholder owner.

### 4. Add admin UI support for owner repair

Update:

```text
src/components/admin/OperatorManagementTab.tsx
```

For operator rows with:

```text
No payout wallet
or user_id not starting with did:privy:
```

show an admin repair section:

```text
Link Owner
- Privy DID
- Payout wallet
- Save
```

This gives the platform admin a controlled way to link a real owner account after a promo/manual setup.

### 5. Improve payout wallet auto-healing for real owners

Update:

```text
src/pages/platform/OperatorApp.tsx
src/pages/platform/OperatorDashboard.tsx
```

When the logged-in user is confirmed as the operator owner and the operator has no payout wallet:

```text
If current Privy wallet exists:
  call set_payout_wallet automatically
```

This ensures that once ownership is correct, the owner’s current embedded wallet becomes the % fee recipient without requiring them to find the Earnings tab first.

### 6. Add safer diagnostics so this is obvious next time

Add clear admin display fields in the Operators tab:

```text
Owner status:
- Linked Privy owner
- Placeholder/manual owner
- Missing payout wallet
```

For Silvertooth today, it would show:

```text
Owner: placeholder/manual
Payout: not set
```

After repair:

```text
Owner: linked Privy account
Payout: 0x3c50…14a9
```

### 7. Audit after the fix

After implementation, run a focused audit:

```text
1. Open 1mg.live/silvertooth while signed out.
2. Confirm public app still loads.
3. Sign in as the Silvertooth owner.
4. Confirm Dashboard button appears.
5. Open /dashboard.
6. Confirm it loads the Silvertooth dashboard, not onboarding.
7. Confirm payout wallet is populated.
8. Confirm admin Operators tab no longer says wallet not connected.
9. Confirm no other operator ownership changed.
```

### Expected result

After the fix:

```text
Silvertooth owner logs in
→ app recognizes the real owner account
→ Dashboard button appears
→ dashboard opens correctly
→ owner’s wallet is set as the % fee payout wallet
→ admin no longer shows wallet not connected
```

This fixes the current Silvertooth problem and adds a safe admin workflow so future manually created promo/operator apps do not get stuck with placeholder ownership.
