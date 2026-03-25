

## Plan: Fix Source-Aware Fee Logic in prediction-submit + Derived EOA Architecture Audit

### Problem

The **frontend** computes fees with source-aware logic (lines 18-21 of PredictionModal.tsx, lines 424-426 of FightPredictions.tsx):

```
if fight.commission_bps is set → use it
else if source === "polymarket" → 200 bps (2%)
else → 500 bps (5%)
```

The **backend** (prediction-submit, lines 844-850) ignores the fight source entirely:

```
effectiveFeeBps = fight.commission_bps ?? controls.default_fee_bps ?? 500
```

Since `default_fee_bps` in `prediction_system_controls` is currently **200**, all fights without an explicit `commission_bps` override (including native 1MGAMING events) get charged only 2% instead of 5%. This is a revenue leak.

### Part 1: Fee Logic Fix

**File:** `supabase/functions/prediction-submit/index.ts`

Replace lines 844-850 with source-aware fee computation matching the frontend:

```typescript
// Source-aware fee: match frontend logic exactly
const isPolymarketSource = fight.source === "polymarket";
const effectiveFeeBps =
  fight.commission_bps != null
    ? Number(fight.commission_bps)
    : isPolymarketSource
      ? 200   // 2% for Polymarket-routed
      : 500;  // 5% for native 1MGAMING events
```

This removes the dependency on `default_fee_bps` from system controls for fee computation (it stays available for other uses). The `LEGACY_DEFAULT_FEE_BPS` constant at line 26 can also be removed since it's no longer used.

Additionally, ensure the API response (already at line 1457) returns `fee_bps: effectiveFeeBps` and the audit log at line 963 already logs it. Both are already in place — no changes needed there.

### Part 2: Derived EOA Architecture Audit (Findings)

Based on the code review, here are the confirmed answers:

1. **pm_trading_key stored server-side:** Yes. The derived private key is stored in plaintext in `polymarket_user_sessions.pm_trading_key`. The backend reads it to sign EIP-712 orders (line 119 of prediction-submit, line 1092).

2. **Derived EOA fully controlled by backend:** Yes. The `privateKeyToAccount(session.pm_trading_key)` call in prediction-submit means the server has full signing authority over the derived EOA. The user never holds this key after the initial SIWE derivation.

3. **Winnings land in derived EOA first:** Yes. Polymarket settles positions to the order signer (the derived EOA). The `withdraw` action in `polymarket-user-setup` transfers USDC.e from derived EOA back to the user's Privy wallet.

4. **1MGAMING has practical custody:** Yes. Since the server holds `pm_trading_key` and can sign transactions from the derived EOA at any time, 1MGAMING has de facto custodial control over routed positions and any funds in the derived wallet.

5. **Recommended path forward:**

   **Option A — Keep delegated model (short-term, lower effort):**
   - Add clear terms of service disclaiming custody risk
   - Encrypt `pm_trading_key` at rest using a per-user envelope key
   - Implement automatic withdrawal of winnings back to user wallet after settlement
   - Add a user-facing "Withdraw" button for manual recovery

   **Option B — True user-wallet-owned model (long-term, production-grade):**
   - Use Privy's server-side signing (Authorization Keys) to sign EIP-712 orders directly from the user's embedded EOA
   - Remove the derived key entirely — the user's Privy wallet IS the Polymarket trading identity
   - Requires Privy Authorization Keys setup and the `@privy-io/node` SDK
   - Eliminates custody concern entirely since Privy holds the key, not 1MGAMING

   **Recommendation:** Ship Option A now (encrypted storage + auto-withdraw) and plan Option B as the V2 migration.

### Implementation Summary

Only **one file changes** for the fee fix:
- `supabase/functions/prediction-submit/index.ts` — 6-line replacement in the fee computation block

No database changes required. The fix will be deployed automatically.

