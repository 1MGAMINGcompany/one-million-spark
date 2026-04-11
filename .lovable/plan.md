

## Plan: Fix "Invalid order payload" + Inconsistent Live Game Data

### Issue 1: "Invalid order payload" — Root Cause Found

The error changed from "Invalid api key" to "Invalid order payload" — meaning **credentials now work** but the order body is wrong.

The problem is in `prediction-submit/index.ts` line 1480:
```
proxy_address: userSession.safe_address || userSession.pm_derived_address || undefined
```

The DB shows `safe_address = NULL` and `pm_derived_address = 0xfc88...`. So `proxy_address` is set to the trading key's own EOA address. In `clobOrderClient.ts`, `!!proxy_address` then triggers `signatureType = 1` (POLY_PROXY mode), which tells Polymarket "this order is signed by a proxy wallet" — but there IS no proxy wallet. The real signer is a plain EOA.

**Fix:** Only set `proxy_address` when there's an actual `safe_address` (a deployed Polymarket proxy). The `pm_derived_address` is the trading key's own address, not a proxy.

### Issue 2: Inconsistent Live Game Data (score/time/period)

The WebSocket provider (`useSportsWebSocket`) maps incoming WS broadcasts to your DB slugs using a `slugToMatchKey` function that extracts league + team codes from slug strings. If the slug format doesn't parse cleanly (e.g. different team code length or unexpected slug structure), the match key lookup fails silently and the live data is dropped.

For games where the slug parses correctly, you get live data. For others, you don't.

### Changes

**File 1: `supabase/functions/prediction-submit/index.ts`** (lines ~1480-1481)
- Change `proxy_address` to only use `safe_address` when it exists
- Don't fall back to `pm_derived_address` — that's the signer, not a proxy
- Only set `funder_address` when `safe_address` is present (already correct)

```typescript
// Before:
proxy_address: userSession!.safe_address || userSession!.pm_derived_address || undefined,
funder_address: userSession!.safe_address ? "0xC5d563A36AE78145C45a50134d48A1215220f80a" : undefined,

// After:
proxy_address: userSession!.safe_address || undefined,
funder_address: userSession!.safe_address ? "0xC5d563A36AE78145C45a50134d48A1215220f80a" : undefined,
```

This means when `safe_address` is null (current state), the order will use:
- `signatureType = 0` (EOA)
- `maker = signer = trading key address`
- `funder = 0x0...0`
- No `POLY_ADDRESS` header issue (still sent, but matches signer)

**File 2: `src/hooks/useSportsWebSocket.tsx`** — improve slug-to-match-key mapping
- Add fallback: if `slugToMatchKey` fails, try matching on partial slug substrings
- Log unmatched WS messages so we can see which games are being dropped
- This addresses why some live games show score/time and others don't

### Expected Outcome
- The next $1 test should either succeed or return a different, more specific Polymarket error (not "Invalid order payload")
- Live game data should appear more consistently across all cards

### What Stays Unchanged
- Browser-side order submission model
- Fee collection, reconciliation, operator attribution
- Credential derivation flow
- All other UI

