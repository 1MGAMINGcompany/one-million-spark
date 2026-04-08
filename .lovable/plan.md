
Fix plan: the latest prediction failure is no longer a generic submit bug. The submit function is correctly rejecting the trade, but the trading-wallet setup flow is not leaving behind a valid saved session for your wallet.

What I found
- The latest `prediction-submit` calls are returning `403`.
- Your submitting wallet `0x3ed6...` has no `polymarket_user_sessions` row.
- `polymarket-user-setup` is being called, but it is not producing a usable session for that wallet.
- Frontend error parsing is already fixed now, so the remaining problem is the setup flow itself plus the fact that setup failures are mostly hidden from the UI.
- Older rows also show exchange geo-block failures, so after setup is fixed the app still needs to show region restrictions clearly if they happen.

Implementation plan

1. Make setup save the correct wallet
- Files: `src/hooks/usePolymarketSession.ts`, `supabase/functions/polymarket-user-setup/index.ts`
- Send both the main app wallet and embedded EOA during setup.
- In the backend, resolve the canonical prediction wallet from the authenticated user binding instead of trusting only the raw client wallet field.
- Save the session under the same wallet identity that `prediction-submit` uses.

2. Stop silent “success” in wallet setup
- File: `supabase/functions/polymarket-user-setup/index.ts`
- Check every session `insert` / `update` result and return a real error if persistence fails.
- Return stage-specific errors for:
  - safe deployment failure
  - approval failure
  - API credential derivation failure
  - session save failure
- Add clear stage logging so setup can be traced end to end.

3. Make readiness rules consistent everywhere
- Files: `supabase/functions/polymarket-user-setup/index.ts`, `supabase/functions/prediction-submit/index.ts`, `src/hooks/usePolymarketSession.ts`
- Use one readiness definition everywhere:
  - active
  - not expired
  - safe deployed
  - approvals set
  - API credentials present
- Update `check_status` and setup responses so `canTrade` matches the stricter submit gate.

4. Stop hiding setup failures in the UI
- Files: `src/pages/FightPredictions.tsx`, `src/pages/platform/OperatorApp.tsx`, `src/components/predictions/EnableTradingBanner.tsx`
- Replace fire-and-forget `setupTradingWallet().catch(() => {})` with an awaited flow.
- After setup, run `refreshSession()` and only continue to allowance/submit if readiness is confirmed.
- Show the real setup error and a retry action.
- Disable submit while setup is still running.

5. Wire the setup state into the prediction UI
- Files: `src/components/predictions/EnableTradingBanner.tsx`, `src/pages/FightPredictions.tsx`, `src/pages/platform/OperatorApp.tsx`
- Actually render the existing trading-wallet banner in both prediction experiences.
- Update banner states so they distinguish:
  - not set up
  - setup incomplete
  - ready
  - funded vs not funded
- Remove the misleading “needs funding” copy for every non-ready state.

6. Surface geo-blocks clearly if that is the next blocker
- Files: `supabase/functions/prediction-submit/index.ts`, `src/pages/FightPredictions.tsx`, `src/pages/platform/OperatorApp.tsx`
- Normalize exchange geo errors to one code, or handle `clob_geo_blocked` explicitly.
- Show a direct “trading restricted in your region” message instead of generic failure.
- Keep this separate from setup-required errors so the app does not loop endlessly.

7. Remove remaining fake Polymarket fallback paths
- File: `supabase/functions/prediction-submit/index.ts`
- Delete the leftover native/local fallback branch for Polymarket-backed fights.
- Polymarket trades should only end as:
  - real exchange submission, or
  - explicit failure

Technical details
- Right now the evidence points to a provisioning bug, not a submit parsing bug:
  - `prediction-submit` is rejecting correctly
  - no saved session exists for the submitting wallet
  - setup is being triggered but not ending in a valid persisted session
- So the real fix is to harden wallet setup persistence and identity matching, then surface failures properly in the UI.

Expected outcome
- If setup succeeds, the next $1 NHL prediction should go through normally.
- If setup fails, the app will show the exact reason instead of silently retrying.
- If the exchange blocks trading by region, the app will say that clearly.
- No more fake fills or misleading “won” states for Polymarket-backed trades.
