## Enable Silvertooth Tulum Championship trading

Verified via `supabase--read_query`: the 4 fights are still `trading_allowed = false`, status `open`. That is exactly what is causing the `market_not_allowlisted` 403 from `prediction-submit` for users trying to predict on Caron/Aviles, Garcia/Pignolet, Zhou/Olvera, and Yahiatene/Cruz.

### 1. Database UPDATE (data, not schema — uses insert tool)

```sql
UPDATE prediction_fights
SET trading_allowed = true,
    updated_at = now()
WHERE id IN (
  '9b0d64a3-5dd5-41da-847b-395d3780fc54', -- Caron vs Aviles
  '60f651ee-1a95-48d5-ab71-1817be0a7242', -- Garcia vs Pignolet
  '879061c6-b56e-49b8-8070-e7e1fb7ada72', -- Zhou vs Olvera
  '6ebf86ff-dd5f-48bf-9ad9-bbdcb91a59f0'  -- Yahiatene vs Cruz
);
```

Effect: `prediction-submit` allowlist gate (per `mem://architecture/prediction/market-allowlist-policy`) will pass for these 4 markets and users can place predictions immediately. No other fights or operators are touched.

### 2. UI hardening — `src/components/operator/SimplePredictionCard.tsx`

Add a single safety net so this never silently fails again:

- Read `trading_allowed` from the fight prop.
- If `false`: disable both Yes/No buttons (`disabled` + reduced opacity) and render a small pill below the matchup reading `⏳ Trading not yet open` (i18n key `prediction.tradingNotOpen` with English fallback).
- If `true` (current): no visual change.

This means even if a future fight is published with the flag still off, prospects see a clear status instead of the trade modal opening and the backend rejecting the order. ~10 lines of additive JSX, no behaviour change for healthy fights.

### Out of scope

- No change to `prediction-submit`, allowlist policy, or any other operator's fights.
- No change to ingest defaults — that's a separate decision.

### Verification after deploy

1. Re-run the SELECT — all 4 rows show `trading_allowed = true`.
2. Sign in as a prospect on Silvertooth Tulum event → place a $5 prediction on Caron/Aviles → trade succeeds, no `market_not_allowlisted`.
3. The pill renders for any fight where `trading_allowed = false` (none in current Silvertooth inventory after fix).