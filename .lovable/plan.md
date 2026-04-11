

## Plan: Fix "Invalid order payload" + Fix Missing Live Game Data

### Two Separate Issues

**Issue 1: "Invalid order payload"** — Three problems in `clobOrderClient.ts`:

1. **Wrong `owner` field**: We send `owner: maker` (an Ethereum address). Polymarket requires `owner` to be the API key string. The Python SDK's `order_to_json(order, self.creds.api_key, ...)` confirms this — `owner = api_key`.

2. **Wrong exchange contract for sports markets**: Sports markets on Polymarket use the **NegRisk CTF Exchange** (`0xC5d563A36AE78145C45a50134d48A1215220f80a`), not the standard CTF Exchange (`0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`). The EIP-712 domain `verifyingContract` must match the correct exchange. All sports events are neg_risk (multi-outcome). We need the backend to tell the browser which exchange to use, or default to neg_risk for Polymarket-backed sports events.

3. **`POLY_PROXY_FUNDER` is actually the NegRisk Exchange address**: The constant `POLY_PROXY_FUNDER = "0xC5d563A36AE78145C45a50134d48A1215220f80a"` is the NegRisk CTF Exchange, not a proxy funder. This was never correct. For EOA mode (our current path), funder is `0x000...000` so this doesn't bite us yet, but it's misleading.

**Issue 2: Live game data not showing** — The WS messages from `wss://sports-api.polymarket.com/ws` include a `slug` field directly (e.g., `"slug": "nhl-wsh-pit-2026-04-11"`). Our code ignores this field and tries to reverse-engineer match keys from `leagueAbbreviation + homeTeam + awayTeam`, which fails when team code formats don't match our DB slugs. Simple fix: match on the `slug` field directly.

---

### Changes

**File 1: `src/lib/clobOrderClient.ts`**
- Add `neg_risk` flag to `ClobOrderParams` (default true for sports)
- Use NegRisk CTF Exchange address (`0xC5d563A36AE78145C45a50134d48A1215220f80a`) when `neg_risk = true`, standard exchange otherwise
- Update EIP-712 domain `verifyingContract` accordingly
- Change `owner` in POST body from `maker` to `credentials.api_key`
- Remove incorrect `POLY_PROXY_FUNDER` constant

**File 2: `supabase/functions/prediction-submit/index.ts`**
- Add `neg_risk: true` to the client-side execution payload for Polymarket-backed events (all sports markets are neg_risk)

**File 3: `src/hooks/useSportsWebSocket.tsx`**
- In `parseLiveMessage`, check `msg.slug` first and do a direct lookup against the set of tracked slugs
- Keep the team-code matching as a fallback
- This is a minimal change that fixes the silent data drops

**File 4: `src/pages/FightPredictions.tsx` + `src/pages/platform/OperatorApp.tsx`**
- Pass `neg_risk` through to `submitClobOrder` from the execution params

---

### Expected Outcome
- The next $1 test uses the correct exchange contract, correct `owner` field, and should either succeed or return a meaningful Polymarket error (like insufficient balance)
- Live game badges (score, period, time) should appear for all active games via the WS slug-matching fix

### What Stays Unchanged
- Browser-side order submission model
- Fee collection, reconciliation, operator attribution
- Credential derivation flow

