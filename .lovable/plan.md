

# Minimal Safe Fix: Polymarket Trading Wallet Setup

## Summary

Three changes to fix the "Trading wallet credential derivation failed" error. The shared fallback credentials exist but the shared trading wallet is **unfunded** (0 USDC.e, 0 POL, 0 CTF allowance), so it cannot execute trades even as a fallback.

---

## Change 1: Fix `deriveClobApiCreds()` — create-first pattern

**File:** `supabase/functions/polymarket-user-setup/index.ts` (lines 206-256)

Replace the current logic with:

```
1. Try POST /auth/api-key first (create new credentials)
2. If 200 OK → return credentials
3. If response indicates "already exists" (400 or 409) → try GET /auth/derive-api-key
4. If GET succeeds → return credentials  
5. If both fail → return error with details
```

Current broken logic: tries GET first, only falls back on 404, misses the 400 case entirely.

---

## Change 2: Deterministic setup message

**File:** `src/hooks/usePolymarketSession.ts` (lines 143-144)

Remove the dynamic timestamp. Change from:

```typescript
const timestamp = Date.now();
const siweMessage = `${SIWE_MESSAGE_PREFIX}\n\nPrimary Wallet: ${walletAddress}\nSigner Wallet: ${signerAddress}\nTimestamp: ${timestamp}\nChain: Polygon (137)`;
```

To:

```typescript
const siweMessage = `${SIWE_MESSAGE_PREFIX}\n\nPrimary Wallet: ${walletAddress}\nSigner Wallet: ${signerAddress}\nChain: Polygon (137)`;
```

Also remove the `timestamp` field from the request body (line 171). The `message` field already carries the full signed text.

---

## Change 3: Shared fallback status (report only — no code change)

Results from `prediction-health`:
- `PM_API_KEY`: present
- `PM_API_SECRET`: present  
- `PM_PASSPHRASE`: present
- `PM_TRADING_KEY`: present → derives `0xFAf5B6FBC1d0D1Cd5844418C152423C460db4557`
- **USDC.e balance: $0.00** — cannot trade
- **POL balance: 0** — cannot pay gas
- **CTF allowance: 0** — not approved for exchange
- **ready_to_buy: false**

The shared fallback credentials are valid but the wallet is empty. Predictions via shared fallback will fail until funded. This is a funding issue, not a code issue — no code change needed.

---

## Old failed sessions

Previous failed attempts created session records with null/empty credentials. The upsert logic (lines 379-416) already handles this — it updates existing records by wallet match. So once the fix is deployed and a user retries, the old record gets overwritten with valid credentials. No manual cleanup required.

---

## Files changed

| File | Change |
|------|--------|
| `supabase/functions/polymarket-user-setup/index.ts` | Rewrite `deriveClobApiCreds()` to POST-first pattern |
| `src/hooks/usePolymarketSession.ts` | Remove timestamp from setup message, remove timestamp from request body |

## What NOT to change

- Privy config / Cloudflare DNS
- `prediction-submit` business logic
- EIP-712 order signing
- Builder keys
- `EnableTradingBanner.tsx` (already updated)
- `supabase/config.toml` (already correct)

## What to test after deployment

1. Go to `/demo`, sign in with Privy
2. Press "Set Up Trading Wallet"
3. Sign the message in wallet popup
4. Should see success instead of "credential derivation failed"
5. Check edge function logs for `V2 PROXY setup complete`

## Note on shared wallet funding

Even after per-user setup works, the shared fallback wallet (`0xFAf5...`) needs USDC.e + POL to function as a safety net. Consider funding it with a small amount of USDC.e (bridged) and POL for gas.

