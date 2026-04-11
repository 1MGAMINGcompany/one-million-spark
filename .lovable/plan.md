

## Plan: Client-Side Order Execution (Bypass Geo-Block)

### Problem
Polymarket blocks all server-side egress IPs (Deno Deploy, Fly.io) for authenticated `POST /order` calls. Read endpoints work fine. The only reliable path is to sign and submit orders directly from the user's browser, which has a non-blocked residential IP.

### Architecture Change

```text
CURRENT (broken):
  Browser → prediction-submit (edge fn) → Fly proxy → POST /order → 403 blocked

NEW:
  Browser → prediction-submit (edge fn)   → fee collection + trade_order record + return credentials
  Browser → sign EIP-712 order locally    → POST directly to clob.polymarket.com/order
  Browser → prediction-confirm (edge fn)  → report order ID back for reconciliation
```

The backend still handles: auth, fee collection, trade order creation, session lookup, reconciliation, pool updates, entries. The browser takes over only the EIP-712 signing + CLOB POST.

### Files to Modify

**1. `supabase/functions/prediction-submit/index.ts`**
- Remove `buildAndSubmitClobOrder()` call and its inline reconciliation
- Remove `fundDerivedWallet()` call (user's browser wallet submits directly — no need to fund a derived EOA)
- After fee collection succeeds, return the order parameters to the client instead of submitting:
  ```json
  {
    "success": true,
    "action": "client_submit",
    "trade_order_id": "...",
    "order_params": {
      "token_id": "...",
      "price": 0.55,
      "net_amount_usdc": 0.95,
      "fee_rate_bps": 150
    },
    "clob_credentials": {
      "api_key": "...",
      "api_secret": "...",
      "passphrase": "...",
      "trading_key": "0x..."
    }
  }
  ```
- Keep all validation, fee collection, trade_order creation, audit logging
- For native (non-Polymarket) events, keep existing direct-fill path unchanged

**2. New edge function: `supabase/functions/prediction-confirm/index.ts`**
- Accepts `{ trade_order_id, polymarket_order_id, status, error_code }` from client after CLOB submission
- Validates Privy JWT + trade_order ownership
- Updates `prediction_trade_orders` with order ID or failure
- Inserts `prediction_entries` (moved from prediction-submit's post-order block)
- Updates fight pool totals
- Logs operator revenue
- Runs the same post-submit reconciliation check

**3. New client-side module: `src/lib/clobOrderClient.ts`**
- Receives order params + credentials from backend
- Signs EIP-712 order using the trading key (viem `privateKeyToAccount` + `signTypedData`)
- Generates HMAC auth headers
- POSTs to `https://clob.polymarket.com/order` directly from user's browser
- Returns `{ orderId, status, error }` to the calling component

**4. `src/pages/FightPredictions.tsx` and `src/pages/platform/OperatorApp.tsx`**
- Update `handleSubmit` flow:
  1. Call `prediction-submit` (unchanged — still does auth + fee + validation)
  2. If response has `action: "client_submit"`, call `clobOrderClient.submitOrder()`
  3. Call `prediction-confirm` with the result
  4. Handle success/failure UI as before
- Remove all geo-block error handling (no longer possible from user's browser)
- Remove `setupTradingWallet` calls — credentials come back from backend per-request

**5. `src/hooks/usePolymarketSession.ts`**
- Simplify: session setup still needed for credential derivation (so backend has creds to return)
- But `canTrade` no longer blocks the UI — the browser handles submission

### Fee Collection Flow (Preserved)
No change. The backend still:
1. Validates allowance on user's Smart Wallet / EOA
2. Executes `transferFrom` via relayer to treasury
3. Records `fee_tx_hash` on the trade order
4. Only then returns order params to client

If fee collection fails, the client never gets order params and no CLOB order is placed.

### Reconciliation (Preserved)
- `prediction-confirm` records the CLOB order ID on the trade order
- `prediction-trade-reconcile` worker continues polling CLOB for fill status (via proxy — GET requests work fine)
- `prediction-trade-status` continues working for UI polling

### Security Considerations
- Trading key is returned to the client temporarily for signing. This is the user's own derived key — not platform funds.
- Credentials are per-user, derived from their own SIWE signature.
- The key never persists in localStorage — used only in-memory for the single order.
- Backend validates the trade_order belongs to the authenticated user before accepting confirmation.

### What Does NOT Change
- Fee collection mechanism (relayer `transferFrom`)
- Trade order table structure
- Reconciliation workers
- Operator revenue tracking
- Native (non-Polymarket) event handling
- Prediction entries schema
- Pool accounting
- Requote/slippage flow (still validated server-side before returning params)

### Implementation Order
1. Create `src/lib/clobOrderClient.ts` (EIP-712 signing + HMAC + POST)
2. Create `supabase/functions/prediction-confirm/index.ts`
3. Modify `prediction-submit` to return order params instead of executing
4. Update `FightPredictions.tsx` and `OperatorApp.tsx` handleSubmit
5. Deploy and test

