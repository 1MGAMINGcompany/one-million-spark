

# Fix Prediction Settlement Pipeline — Result Detection Not Working

## Root Cause

The `prediction-result-detect` edge function queries Polymarket's Gamma API using:
```
GET /markets?condition_id={conditionId}&limit=1
```

This filter is **broken** — it returns unrelated markets (e.g., a 2020 Biden COVID market instead of Lightning vs Sabres). The automation logs confirm every check returns `result_detect_unclear` with `outcomePrices: ["0", "0"]` from wrong markets.

Meanwhile, every fight in the database already has a reliable `polymarket_market_id` (numeric ID like `1552106`). Querying `/markets/{id}` returns the correct data instantly. The Lightning vs Sabres market **is resolved** on Polymarket (closed=true, prices=["0","1"], Sabres won), but our worker never sees it.

**Result**: 128 fights stuck in `live`, no winners populated, no "Collect Winnings" button, no payouts.

## Fix Plan (3 changes)

### 1. Fix `fetchGammaMarket` to use market ID (Critical)

**File**: `supabase/functions/prediction-result-detect/index.ts`

Change the fetch function to prefer `polymarket_market_id` (numeric) over `condition_id`:

```
-- Current (broken):
  /markets?condition_id={conditionId}&limit=1

-- Fixed (primary):
  /markets/{marketId}          ← direct lookup, always correct

-- Fallback (secondary):
  /markets?condition_id={conditionId}&limit=1
  + validate returned conditionId matches requested one
```

Update the DB query to also select `polymarket_market_id` from `prediction_fights`. Pass it to the fetch function. If `polymarket_market_id` exists, use `/markets/{id}` directly. If not, fall back to condition_id query but verify the returned conditionId matches.

### 2. Fix winner detection for named outcomes

**File**: `supabase/functions/prediction-result-detect/index.ts`

Current `detectWinner` only checks price thresholds. But Polymarket returns `outcomes: ["Lightning", "Sabres"]` — the function needs to map outcome names to fighter_a/fighter_b using the fight's `fighter_a_name` / `fighter_b_name`. Additionally, use `polymarket_outcome_a_token` / `polymarket_outcome_b_token` for token-based matching when outcome names don't directly match.

Steps:
- Parse `outcomes` array from the market response
- Match by token ID first (if stored), then by name similarity
- Map the winning outcome index to `fighter_a` or `fighter_b`

### 3. Run one-time remediation for stuck fights

After deploying the fixed worker, manually invoke it to process the 128 stuck fights. The cron job (every 2 minutes) will handle this automatically going forward, but we should trigger one immediate run.

## What Does NOT Change
- My Picks UI (already correct — shows "Collect Winnings" when winner is set)
- `prediction-auto-settle` (works correctly once fights reach `confirmed`)
- `prediction-auto-claim` (works correctly once fights reach `settled`)
- Balance display / polling hooks
- Frontend prediction submission flow

## Expected Outcome
After this fix:
1. Lightning vs Sabres → `confirmed`, winner = `fighter_b` (Sabres), user sees "You Won!" + "Collect Winnings"
2. All 128 stuck `live` fights get checked against correct Polymarket data
3. Future games auto-settle correctly via the 2-minute cron

