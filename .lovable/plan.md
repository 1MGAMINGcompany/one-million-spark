
Root cause: this is not primarily a Polymarket market-connection failure. Both attempts are dying earlier in the shared fee-relayer step inside `prediction-submit`.

What I found:
- `prediction-preflight` is succeeding now.
- `prediction-submit` logs show: `Relayer transferFrom failed: TypeError: Cannot convert undefined to a BigInt`
- Audit trail for both failed trades shows the exact same sequence:
  - `request_received`
  - `controls_passed`
  - `trade_record_created`
  - `fee_collection_started`
  - `fee_collection_failed`
- So the flow never reaches a reliable Polymarket submission step for those trades.

Implementation plan:
1. Harden relayer RPC handling in `supabase/functions/prediction-submit/index.ts`
- Replace the single hardcoded Polygon RPC call with a fallback list, similar to the frontend Polygon hook.
- Validate every JSON-RPC response before using `BigInt(...)`.
- Specifically guard:
  - allowance response
  - nonce response
  - gas price response
- Return explicit errors like:
  - `rpc_nonce_unavailable`
  - `rpc_gas_price_unavailable`
  - `rpc_allowance_unavailable`
  instead of crashing with `undefined`.

2. Make fee collection failure observable and recoverable
- Add structured audit payloads for the raw RPC failure point and selected RPC endpoint.
- Keep the trade order in a clear failed state with a precise `error_code`, so it’s obvious the failure happened before exchange submission.
- Prevent ambiguous “Polymarket failed” UX when the relayer step is the real problem.

3. Protect exchange submission sequencing
- Ensure the function only attempts Polymarket order creation after fee collection fully succeeds.
- Add a clear branch in logs/audit for:
  - fee collection failed before exchange
  - exchange submission failed after fee collection
- This will separate relayer issues from true Polymarket/CLOB issues.

4. Improve frontend error messaging in `src/pages/FightPredictions.tsx`
- Surface a more accurate error when the backend returns relayer/RPC failure.
- Message should say the approval may have succeeded, but the backend could not collect the fee / continue the order.
- Avoid implying the user must reconnect or re-approve unless allowance is actually missing.

Files to update:
- `supabase/functions/prediction-submit/index.ts`
- `src/pages/FightPredictions.tsx`

Technical details:
```text
Current failing path:
UI submit
  -> prediction-preflight OK
  -> prediction-submit
     -> create trade record
     -> collectFeeViaRelayer()
        -> eth_getTransactionCount / eth_gasPrice / allowance parse
        -> BigInt(undefined) crash
     -> stops before reliable Polymarket submission
```

Expected result after fix:
- trades no longer fail on both events due to the same backend RPC parsing issue
- if Polygon RPC is flaky, backend retries another RPC instead of crashing
- logs will clearly show whether a future failure is relayer-side or truly Polymarket-side
- users get an accurate message instead of a misleading final failure
