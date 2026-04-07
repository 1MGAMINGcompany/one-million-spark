
Fix NHL prediction failures

What I found

- The NHL markets themselves are healthy: they are open, mapped to Polymarket, and recently synced.
- Your current wallet `0x3ed6...` has no `polymarket_user_sessions` row, so the backend is rejecting the order before it ever reaches the market.
- The backend is already returning the right reason (`trading_wallet_setup_required` / no trading session), but the frontend is not reading it correctly.
- In both `src/pages/platform/OperatorApp.tsx` and `src/pages/FightPredictions.tsx`, the app checks `data?.error_code`. For non-2xx edge-function responses, `supabase.functions.invoke()` puts the real JSON body inside `FunctionsHttpError.context`, so the UI falls back to a generic “Prediction failed” and never starts wallet setup.
- There is also a backend mismatch in `supabase/functions/prediction-submit/index.ts`: the early session check is too loose (`active` or `pending`), while the later execution step requires a fully active credential set. That can still create avoidable failures.

Do I know what the issue is?

Yes:
1. No active personal trading session exists for this wallet.
2. The frontend fails to unwrap the backend’s real error payload, so setup is never triggered.
3. The backend readiness check should be tightened so partial sessions cannot slip through.

Plan

1. Fix edge-function error parsing in the UI
- Files: `src/pages/platform/OperatorApp.tsx`, `src/pages/FightPredictions.tsx`
- Handle `FunctionsHttpError` explicitly and read `await error.context.json()`.
- Use the parsed `error_code` to trigger `setupTradingWallet()` and show the exact backend message.

2. Add a pre-submit trading-wallet gate
- Files: same two pages
- Before allowance or submission, if the fight is Polymarket-backed and `!hasSession || !canTrade`, stop and run the setup flow first.
- After setup, refresh session state and only continue if trading is actually ready.

3. Wire visible setup state into the prediction UI
- Reuse the existing `src/components/predictions/EnableTradingBanner.tsx` (currently not wired up).
- Show “Set Up Trading Wallet” / “Wallet not ready” instead of letting users repeatedly hit a failing submit button.

4. Tighten backend readiness validation
- File: `supabase/functions/prediction-submit/index.ts`
- Replace the early “session exists” check with a true readiness check:
  - active status
  - not expired
  - safe deployed
  - approvals set
  - required Polymarket creds present
- Return `trading_wallet_setup_required` or `trading_wallet_not_ready` before any fee movement.

5. Prevent the next failure loop
- Keep the no-session rejection before fee collection.
- Align the early and late checks so the backend cannot pass a partial session and then fail deeper in the flow.
- Improve the user-facing message for exchange-side rejection so if Polymarket rejects later, the app shows the exact reason instead of “Prediction failed”.

Technical details

- Frontend bug: `supabase.functions.invoke()` non-2xx responses need `FunctionsHttpError.context.json()` to access `{ error, error_code }`.
- Backend bug: the early session gate is weaker than the later credential lookup.
- Evidence: there is no session row for your wallet, and the recent submit attempts hit the function but did not create a new successful trade row.

Expected outcome

- When you tap a $1 NHL prediction, the app will first prompt/setup your trading wallet instead of failing silently.
- If setup completes, submission proceeds normally.
- If something still blocks execution, the app will show the real reason clearly.
- No more generic failed prediction loop.
