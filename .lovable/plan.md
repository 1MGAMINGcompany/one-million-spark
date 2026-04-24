# Fix Operator Commission Sweep

## Problem
In the new "Pool model" for custom events, all user funds (95% stake + 5% fee) flow into the **Treasury** wallet (`0x72F3…d88d`). However, the operator commission sweep in `prediction-submit/index.ts` still signs with `FEE_RELAYER_PRIVATE_KEY` (`0x0692…4d0D`), which no longer holds USDC.e. Result: every operator sweep (e.g., Silvertooth's 3.5%) will fail with "insufficient balance," leaving operator funds stranded in the Treasury.

## Change

**File: `supabase/functions/prediction-submit/index.ts`** (line 1851)

Switch the operator-revenue sweep signer from `FEE_RELAYER_PRIVATE_KEY` → `TREASURY_PRIVATE_KEY`. This block is inside the native/custom-event branch (after the `prediction_entries` insert at line 1788), so it does NOT affect the Polymarket sweep path elsewhere in the file.

```diff
- const relayerKey = Deno.env.get("FEE_RELAYER_PRIVATE_KEY");
- if (relayerKey) {
+ // Custom-event fees now sit in the Treasury (pool model).
+ // Sweep operator commission FROM Treasury, not Relayer.
+ const treasuryKey = Deno.env.get("TREASURY_PRIVATE_KEY");
+ if (treasuryKey) {
    const sweepAccount = privateKeyToAccount(
-     (relayerKey.startsWith("0x") ? relayerKey : `0x${relayerKey}`) as `0x${string}`,
+     (treasuryKey.startsWith("0x") ? treasuryKey : `0x${treasuryKey}`) as `0x${string}`,
    );
```

Also update the `relayer_not_configured` error string to `treasury_not_configured` for clarity.

## Memory Update

**File: `mem://infrastructure/1mg-live/polygon-wallet-roles`**

Reflect that the Treasury now signs ALL outbound USDC.e transfers for custom events:
- Winner payouts (`prediction-claim`, `prediction-auto-claim`)
- Operator commission sweeps (`prediction-submit`)

Bump recommended POL balance for Treasury from ~1–2 POL → **~3–5 POL**.

## Deployment
Redeploy `prediction-submit` after the change.

## Untouched
- Polymarket events (stakes stay in user Safes, fees route via existing Relayer path)
- Platform 1.5% retention logic (already accounted in `platformFeeUsd`)
- Frontend code

## Money Flow After Fix (Custom Events)

```
User Safe ──95% stake──► Treasury ──┬──► Winner payout (Treasury signs)
                                     └──► Operator commission (Treasury signs)
User Safe ──5% fee────► Treasury ──► Platform retains 1.5% + operator gets 3.5%
                       Relayer signs collection only (gas)
```

## Gas Funding Recap
- **Fee Relayer `0x0692…4d0D`**: ~5 POL (collections only)
- **Treasury `0x72F3…d88d`**: **~3–5 POL** (payouts + operator sweeps)