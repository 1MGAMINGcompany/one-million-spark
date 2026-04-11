

## Plan: Use Official Polymarket SDK + Restore Live Game Data

### Summary

Replace the hand-built order serializer in `clobOrderClient.ts` with Polymarket's official `@polymarket/clob-client` SDK, and add a snapshot-first live data layer so scores/periods always appear.

---

### PART 1 — Replace manual order builder with official SDK

**File: `package.json`**
- Add `@polymarket/clob-client` as a dependency

**File: `src/lib/clobOrderClient.ts`** — near-complete rewrite
- Import `ClobClient`, `Side`, `OrderType` from `@polymarket/clob-client`
- Import `privateKeyToAccount` + `createWalletClient` + `http` from `viem`
- In `submitClobOrder()`:
  1. Create a viem `WalletClient` from the trading key (using `privateKeyToAccount` + polygon chain)
  2. Construct `ClobClient` with the wallet client, API creds (`{key, secret, passphrase}`), correct `signatureType` (0 for EOA when no `proxy_address`, 1 for POLY_PROXY when `safe_address` exists), and `funder` 
  3. Call `client.createAndPostMarketOrder({ tokenID, side: Side.BUY, amount: net_amount_usdc }, { tickSize: "0.01", negRisk: params.neg_risk })` — this handles EIP-712 signing, fee rate fetching, exchange selection, order serialization, HMAC auth headers, and POST internally
  4. Return the order ID from the response
  5. Keep the existing `ClobSubmitResult` interface and diagnostics logging for debugging
- Remove: all manual EIP-712 domain/types, manual HMAC generation, manual `/order` body JSON construction, manual exchange contract selection
- Keep: `ClobOrderParams`, `ClobCredentials`, `ClobSubmitResult` interfaces (adjusted), geo-block detection on error responses

This eliminates every source of serializer drift: `owner`, `signatureType`, `funder`, `feeRateBps`, `negRisk`, `orderType`, exchange contract, and HMAC format are all handled by the official client.

### PART 2 — Clean up backend drift

**File: `supabase/functions/prediction-submit/index.ts`**
- The backend currently returns `order_params` with `fee_rate_bps`, `neg_risk`, `price`, `net_amount_usdc` — keep returning `token_id`, `price`, `net_amount_usdc` (the SDK still needs these)
- Remove `fee_rate_bps` and `neg_risk` from `order_params` since the SDK fetches/determines these automatically — or keep them as optional hints
- Keep `clob_credentials` block unchanged (api_key, api_secret, passphrase, trading_key, proxy_address, funder_address)
- Keep fee collection, records, reconciliation, and attribution unchanged

### PART 3 — Restore live game data with snapshot + WS merge

**File: `src/hooks/useSportsWebSocket.tsx`**
- On mount (and when `slugs` changes), call the `live-game-state` edge function with the current slug list to get an initial snapshot
- Seed the `games` Map with snapshot results before any WS messages arrive
- WS messages then overlay/update the snapshot data as they arrive
- Keep the existing `parseLiveMessage` slug-matching logic (direct match + partial match fallback)
- Add a console.warn for unmatched WS messages (first 5 only, to avoid log spam) for debugging

This ensures that even if the WebSocket never sends a matching message, the UI still shows the last-known score/period/status from the REST snapshot.

### PART 4 — Diagnostics for next test

**File: `src/lib/clobOrderClient.ts`**
- Log before submission: `signatureType`, `funder`, `negRisk`, SDK version, `tokenID`, `amount`
- Log after submission: order ID, HTTP status, response snippet
- On error: capture whether it came from SDK internals or network, include full error message
- Include a `usedOfficialClient: true` flag in diagnostics so the audit trail confirms which path was used

---

### Technical Details

The `@polymarket/clob-client` SDK:
- Accepts a viem `WalletClient` directly (documented in their README)
- `createAndPostMarketOrder` is a single call that creates, signs, and submits a market order (FOK)
- Automatically fetches the correct fee rate for the token
- Automatically selects the correct exchange contract (NegRisk vs standard) based on the `negRisk` option
- Handles all HMAC L2 auth headers internally
- Sets `owner` to the API key correctly

### Files Changed
1. `package.json` — add `@polymarket/clob-client`
2. `src/lib/clobOrderClient.ts` — replace manual serializer with SDK calls
3. `src/hooks/useSportsWebSocket.tsx` — add snapshot seeding from `live-game-state` edge function
4. `supabase/functions/prediction-submit/index.ts` — minor cleanup of `order_params` (optional)

### What Stays Unchanged
- Browser derives credentials, browser signs orders, browser POSTs directly
- Backend fee collection, reconciliation, operator attribution
- Credential derivation flow
- All other UI components
- `prediction-confirm` edge function
- `live-game-state` edge function (already works, just unused by frontend)

### Expected Outcome
- Order payload errors should stop entirely — the SDK constructs the canonical payload
- Live game badges (LIVE, score, period, time) should appear immediately from snapshot, then update via WS
- One fresh $1 test will confirm whether the order succeeds or reveals a new class of error (e.g., insufficient balance, market closed)

