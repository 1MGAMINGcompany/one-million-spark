

## Fix: Add JWKS Retry Logic to prediction-submit

### Root Cause
The prediction failed because Privy's JWKS endpoint (`auth.privy.io/.well-known/jwks.json`) returned a non-200 response during the preflight auth check. All 3 retry attempts failed — this is a transient Privy infrastructure issue. The system correctly blocked the trade before any funds moved.

This is not a code bug — it's a transient external service failure. However, there is a hardening improvement to make:

### Problem
`prediction-submit` does NOT have retry logic for JWKS verification (lines 394-408), unlike `prediction-preflight` which retries 3 times with exponential backoff. If preflight passes but submit's JWKS fetch fails moments later, the user gets a confusing auth error.

### Plan

#### 1. Add JWKS retry to prediction-submit
Extract the same `verifyWithRetry` pattern from `prediction-preflight` into `prediction-submit/index.ts`. Replace the single `createRemoteJWKSet` + `jwtVerify` call (lines 394-401) with a retry loop (3 attempts, 1s delay).

#### 2. Improve error message clarity
Update the frontend error message in `FightPredictions.tsx` to be more user-friendly when the error is a JWKS transient failure — suggest "Please try again" more prominently rather than showing the raw technical detail.

### Files to modify
- `supabase/functions/prediction-submit/index.ts` — Add retry logic for JWKS verification
- `src/pages/FightPredictions.tsx` — Friendlier error message for transient auth failures

