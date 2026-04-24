# Fix Polymarket Operator Commission Sweep

## Problem
`supabase/functions/prediction-confirm/index.ts` sweeps Polymarket operator commissions (e.g. Silvertooth's 3.5%) using `FEE_RELAYER_PRIVATE_KEY`. But Polymarket fees are now collected into the **Treasury** wallet, not the Relayer. So every Polymarket operator sweep fails with `insufficient balance`.

## Change

**File: `supabase/functions/prediction-confirm/index.ts`** — `sweepOperatorFee()` function (~line 90)

- Read `TREASURY_PRIVATE_KEY` instead of `FEE_RELAYER_PRIVATE_KEY`
- Update error string `relayer_not_configured` → `treasury_not_configured`
- Update log labels to reflect Treasury as signer

## Deployment
Redeploy `prediction-confirm` after the change.

## Memory Update
Update `mem://infrastructure/1mg-live/polygon-wallet-roles` to add `prediction-confirm` to Treasury's outbound responsibilities.

## Untouched
- Custom-event sweep in `prediction-submit` (already on Treasury ✅)
- Winner payouts in `prediction-claim` / `prediction-auto-claim` (already on Treasury ✅)
- Relayer collection paths (still Relayer-signed, gas only)
- Frontend code

## Gas Funding
- **Treasury `0x72F3…d88d`**: ~3–5 POL (now signs both custom AND Polymarket operator sweeps + payouts)
- **Fee Relayer `0x0692…4d0D`**: ~5 POL (collections only)
