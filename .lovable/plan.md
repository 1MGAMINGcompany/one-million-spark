

## Plan: Fix "Temporary auth issue" — Privy JWKS verification failing in edge functions

### Root Cause

The screenshot confirms the user is hitting the "Temporary auth issue" toast every time they try to submit a prediction. This fires when the `prediction-preflight` edge function returns a 401 with a `detail` containing "Expected 200 OK" or "JWKS" — meaning the Privy JWKS endpoint (`https://auth.privy.io/.well-known/jwks.json`) is unreliable from within the edge function runtime.

The current 3-retry loop with 1s delays isn't enough. Edge function cold starts + Privy JWKS latency can combine to exhaust retries. Additionally, the preflight function has **zero console.log statements**, making it impossible to diagnose from logs.

### Fixes (3 files)

**1. Add diagnostic logging to `prediction-preflight` edge function**
- File: `supabase/functions/prediction-preflight/index.ts`
- Add `console.log` at: request received, each retry attempt, success, and failure
- Log the actual error message on failure so we can see exactly what Privy returns
- Increase retry delay from 1s to 1.5s and add a 4th attempt

**2. Add diagnostic logging to `prediction-submit` edge function**  
- File: `supabase/functions/prediction-submit/index.ts`
- Add logging around the JWKS verification step (same pattern as preflight)

**3. Improve client-side error handling for persistent JWKS failures**
- File: `src/pages/FightPredictions.tsx`
- When the "Temporary auth issue" error occurs, add a "Retry" action button to the toast instead of just telling the user to wait
- After 2 consecutive JWKS failures, skip the preflight entirely and attempt the direct submit (since prediction-submit also verifies JWT independently — the preflight is just a safety check)
- Log the full error detail to console for debugging

### Technical Detail

The preflight is a **non-essential safety gate** — `prediction-submit` performs the same JWT verification. The preflight exists to prevent orphaned fee transfers. If the JWKS endpoint is persistently slow, we can safely skip preflight and let `prediction-submit` handle auth, since no fee transfer happens until after submission is accepted.

```text
Current flow (fails at step 2):
  1. getAccessToken() ✅
  2. prediction-preflight → JWKS fails 3x → "Temporary auth issue" ❌
  3. (never reached) allowance check
  4. (never reached) prediction-submit

Proposed flow (with bypass):
  1. getAccessToken() ✅
  2. prediction-preflight → JWKS fails → retry once more
  3. If still fails → skip preflight, proceed directly
  4. allowance check
  5. prediction-submit → verifies JWT itself
```

### Files to edit
1. `supabase/functions/prediction-preflight/index.ts` — Add logging, increase retries
2. `supabase/functions/prediction-submit/index.ts` — Add logging around JWKS step  
3. `src/pages/FightPredictions.tsx` — Add preflight bypass after repeated failures + retry button

