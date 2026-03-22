
Root cause from the logs: the approval transaction is actually succeeding now, but the prediction still fails immediately after because `prediction-submit` is still doing live JWKS verification against `https://auth.privy.io/.well-known/jwks.json`, and that endpoint is returning non-200 responses from the backend runtime. The latest logs show:

- `prediction-preflight`: all 4 JWKS attempts failed
- `prediction-submit`: all 4 JWKS attempts failed
- your Privy modal screenshot shows `Transaction complete` for the approval itself

So the current failure is not the sponsored approval anymore — it is backend auth.

Also, no, you should not have to sign with Privy on every prediction. The intended flow is:

```text
first prediction only:
  1. one-time USDC approval signature
  2. backend stores/use allowance
  3. relayer collects fees later without another wallet modal

later predictions:
  1. no approval modal
  2. backend relayer uses existing allowance
```

Right now it feels like “every time” because submission is failing after approval, and the UI does not reliably preserve the fact that approval already happened.

Plan:

1. Stabilize Privy auth in backend functions
- Replace the current live-JWKS verification path in:
  - `supabase/functions/prediction-preflight/index.ts`
  - `supabase/functions/prediction-submit/index.ts`
- Use Privy’s app-secret-backed server-side token verification flow instead of creating a fresh remote JWKS fetch on every request.
- Keep structured logging, but log whether failure is:
  - token missing
  - token expired/invalid
  - Privy user fetch failed
  - wallet mismatch

2. Make `prediction-submit` the source of truth
- Keep preflight as optional UX protection only.
- If preflight has transient auth-network issues, do not block the trade flow before approval.
- Ensure submit uses the stable verification path so the final gateway no longer fails on JWKS fetches.

3. Prevent repeated approval prompts after a successful one-time approval
- In `src/pages/FightPredictions.tsx`, keep a local “approval completed” flag for the current session/attempt.
- After `approveFeeAllowance()` succeeds, do not ask for approval again just because `relayer_allowance` polling has not refreshed yet.
- Optionally trigger an immediate allowance refresh after approval instead of waiting for the polling interval.

4. Clarify UX so users know what they are signing
- In `TradeTicket` / prediction modal text, explicitly label the approval as:
  - “One-time USDC approval”
  - “Not charged now”
  - “Future predictions won’t require another approval until allowance is used up or revoked”
- If backend submission fails after approval, show a specific message:
  - approval succeeded
  - trade was not submitted
  - retry should not require another approval

5. Tighten failure handling
- In `FightPredictions.tsx`, distinguish:
  - approval failure
  - backend auth failure
  - trade execution failure
- If submit fails after approval, retry only the backend submission path rather than sending the user back through the approval flow.

Files to update:
- `supabase/functions/prediction-preflight/index.ts`
- `supabase/functions/prediction-submit/index.ts`
- `src/pages/FightPredictions.tsx`
- `src/components/predictions/TradeTicket.tsx`
- possibly `src/hooks/usePolygonUSDC.ts` or `src/hooks/usePrivyFeeTransfer.ts` for immediate post-approval allowance refresh/state sync

Expected result after this fix:
- first prediction: one Privy approval modal only
- subsequent predictions: no Privy approval modal for each trade
- backend auth no longer randomly fails because of live JWKS fetch instability
- clearer messaging when approval succeeded but trade submission did not
