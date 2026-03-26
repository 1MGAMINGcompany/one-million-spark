

# Diagnostic: Why predictions are still failing

## Finding

The code changes from the last session (native pool fallback, removal of shared backend CLOB fallback) were **not successfully deployed** to the live edge function. The audit trail proves this:

- All 4 recent trades show `cred_source: shared_backend` — a code path that was supposed to be **removed**
- All 4 end with `trade_failed` + `clob_rejected` ("Trading restricted in your region")
- The native pool fallback (`native_pool_fallback_filled`) **never appears** in any audit log
- Fee is collected every time ($0.02), then the trade fails — the user loses the fee

The code in the repository is correct. The deployed edge function is stale.

## Fix

### 1. Redeploy `prediction-submit` edge function
Force a fresh deployment of the current code which already contains:
- Shared backend fallback removed
- Native pool fallback when no per-user session or geo-block detected
- Proper audit logging (`clob_skipped_no_session`, `clob_geo_blocked_fallback`, `native_pool_fallback_filled`)

### 2. Verify deployment
After deploy, run a test trade and confirm the audit log shows `native_pool_fallback_filled` instead of `shared_backend` + `clob_rejected`.

## No code changes needed
The repository code is already correct. This is purely a deployment issue.

