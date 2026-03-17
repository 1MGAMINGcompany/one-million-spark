

## Prediction Automation Audit — Findings

### What Works Today (End-to-End)

Your current flow after you **approve an event** is:

```text
approved → [schedule-worker locks fights] → [schedule-worker marks live]
         → [result-worker detects result] → result_selected → confirmed
         → [auto-settle settles after claims_open_at] → settled
         → [user claims SOL via prediction-claim]
```

**All secrets are configured**: `BALLDONTLIE_API_KEY`, `API_FOOTBALL_KEY`, `PREDICTION_VERIFIER_SECRET_KEY`, `SOLANA_RPC_URL`.

### Critical Gap: Missing Cron Jobs

Only `prediction-auto-settle` has cron jobs (2 duplicates, actually). The two most important workers have **NO cron jobs**:

| Worker | Cron? | Impact |
|--------|-------|--------|
| `prediction-schedule-worker` | **MISSING** | Fights never auto-lock or go live |
| `prediction-result-worker` | **MISSING** | Results never auto-detected |
| `prediction-settle-worker` | **MISSING** | Job-based settlement never runs |
| `prediction-auto-settle` | ✅ (duplicate) | Confirmed→settled works |
| `prediction-refund-worker` | N/A (admin-triggered) | OK as-is |

**This is the root cause**: After you approve events, nothing happens automatically because the schedule and result workers are never called.

### Secondary: Duplicate Auto-Settle Cron

There are two identical cron jobs (jobid 2 and 3) for `prediction-auto-settle`. One should be removed.

### Additional Issue: `approveEvent` Doesn't Set `auto_resolve`

When you approve an event via `approveEvent`, it only sets `status: "approved"`. If the event was ingested with `auto_resolve: false` (the default), the result-worker will skip it because it filters on `auto_resolve = true`. You'd need to manually toggle that or the ingest should set it.

### Plan

1. **Add cron job for `prediction-schedule-worker`** — every minute, handles lock + live transitions
2. **Add cron job for `prediction-result-worker`** — every 2 minutes, detects results from APIs
3. **Add cron job for `prediction-settle-worker`** — every minute, job-based settlement
4. **Remove duplicate `prediction-auto-settle` cron** (jobid 3)
5. **Fix `approveEvent`** to also set `auto_resolve: true` when approving, so the result worker picks it up automatically

All changes are SQL inserts for cron jobs + one small update to the `prediction-admin` edge function. No schema changes, no Solana/wallet/settlement logic changes.

### Technical Detail

Cron jobs will be added via the insert tool (not migrations) since they contain project-specific URLs and keys:

```sql
-- Schedule worker: every minute
SELECT cron.schedule('prediction-schedule-worker', '* * * * *', $$ ... $$);

-- Result worker: every 2 minutes
SELECT cron.schedule('prediction-result-worker', '*/2 * * * *', $$ ... $$);

-- Settle worker: every minute  
SELECT cron.schedule('prediction-settle-worker', '* * * * *', $$ ... $$);

-- Remove duplicate
SELECT cron.unschedule(3);
```

The `approveEvent` action in `prediction-admin` will be updated to include `auto_resolve: true` alongside `status: "approved"`.

