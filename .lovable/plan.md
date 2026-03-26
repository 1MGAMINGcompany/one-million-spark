
## Diagnostic

The new failure is not your wallet, not the VPN, and not the approval anymore.

What the backend logs show, in order:

```text
JWT verified → PASS
Allowance on smart wallet 0x3ed... → 0
Allowance on EOA 0xc097... → sufficient
Fee collected via relayer → PASS
Order submit to clob.polymarket.com → FAIL 403
Error: "Trading restricted in your region"
```

I also checked the recent trade records:
- multiple latest `prediction_trade_orders` failed with `error_code = clob_rejected`
- all of them contain the same geoblock error
- fee collection succeeded before the rejection

Important extra finding:
- `prediction-submit` logs: `Using shared backend CLOB creds (user has no per-user session)`
- `polymarket_user_sessions` only has an old session for the EOA wallet `0xc097...`
- that session is `awaiting_credentials`, `safe_deployed=false`, `approvals_set=false`
- there is no active session for the smart wallet `0x3ed...`

So there are really 2 problems:

### Problem 1 — VPN does not help backend execution
Your VPN only changes the browser/client route. The actual trade is submitted by the backend function, and that request still originates from the backend region/IP. That backend IP is being geo-blocked by Polymarket’s CLOB API.

### Problem 2 — the app is falling back to the wrong execution mode
`FightPredictions.tsx` calls `usePolymarketSession()` but does not actually use `setupTradingWallet()` before trading.
So `prediction-submit` cannot find an active per-user trading session and silently falls back to shared backend CLOB credentials:
```text
shared_backend → direct CLOB submit → geo blocked
```

## What to build to fix it

### 1. Remove the silent shared-backend CLOB fallback for real trades
In `supabase/functions/prediction-submit/index.ts`:
- stop using `PM_API_KEY / PM_API_SECRET / PM_PASSPHRASE / PM_TRADING_KEY` as the automatic fallback for Polymarket-backed order placement
- if no active per-user session exists, return a clear setup-required error instead

Why:
- right now the backend hides the real issue and takes the wrong route
- this is why the user pays the fee and still gets blocked

### 2. Force trading-wallet setup before submit
In `src/pages/FightPredictions.tsx`:
- actually read `hasSession`, `status`, `canTrade`, `safeDeployed`, `approvalsSet`, `setupTradingWallet`, `refreshSession` from `usePolymarketSession()`
- before calling `prediction-submit`, if the fight is Polymarket-backed and the session is not active, run `setupTradingWallet()`
- if setup fails, stop there and show a specific message instead of continuing

Why:
- today the hook is mounted but not used
- the user never completes the intended per-user provisioning flow

### 3. Replace direct CLOB order submission with the Builder/Relayer execution path
In `supabase/functions/prediction-submit/index.ts`:
- replace `buildAndSubmitClobOrder()` as the production execution path for Polymarket-backed trades
- use the existing Builder credentials already configured:
  - `POLYMARKET_BUILDER_API_KEY`
  - `POLYMARKET_BUILDER_SECRET`
- route order execution through Polymarket’s Builder/Relayer flow instead of direct `https://clob.polymarket.com/order` from the backend

Why:
- your current direct CLOB submit is exactly what is being geo-blocked
- the project already contains Builder/Relayer setup code in `polymarket-user-setup`, so the architecture is already partly there

### 4. Do not collect the fee before confirming the order route is executable
In `prediction-submit`:
- move fee collection later, after the backend confirms the trade route is available
- or add a compensating refund/reversal path if submission fails after fee collection

Why:
- current flow is:
  1. collect fee
  2. attempt trade
  3. trade fails
- that creates a bad user outcome even when the failure is fully backend-side

### 5. Add explicit health and guard rails
Before submitting a Polymarket-backed trade:
- verify per-user session exists and is active
- verify Builder credentials are present
- verify execution route is available
- if not, fail early with a clean error like:
  - `trading_wallet_setup_required`
  - `builder_execution_unavailable`
  - `region_route_blocked`

## Files to update

- `src/pages/FightPredictions.tsx`
  - use the full `usePolymarketSession()` state
  - trigger `setupTradingWallet()` before submit
  - block submit if setup/execution prerequisites are not ready

- `src/hooks/usePolymarketSession.ts`
  - likely small adjustments only, mainly to support the UI flow and refresh behavior after setup

- `supabase/functions/prediction-submit/index.ts`
  - remove silent shared CLOB fallback for live trading
  - replace direct CLOB execution with Builder/Relayer submission
  - change fee timing / failure handling
  - improve error codes and audit logs

## Expected end state

After the fix, the flow should be:

```text
User connected
→ per-user trading wallet setup verified or created
→ backend confirms Builder execution path ready
→ fee collected only when route is valid
→ order submitted through Builder/Relayer
→ success/failure returned with precise reason
```

## Technical notes

- The current direct `fetch(${CLOB_BASE}/order)` path is the failing point.
- The VPN on your device does not change the backend edge function’s IP.
- The log `Using shared backend CLOB creds` is a red flag and should not happen for production user trades.
- The session table currently shows provisioning is incomplete, and the active trading-wallet path is not being enforced from the UI.

## Implementation priority

1. Block shared-backend fallback
2. Enforce `setupTradingWallet()` before submit
3. Switch execution from direct CLOB to Builder/Relayer
4. Reorder fee collection / add refund safety
5. Add clearer user-facing and audit diagnostics
