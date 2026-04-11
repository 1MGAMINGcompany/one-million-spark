

## Plan: Fix Processing Forever + Fix SDK Order Call + Restore Live Scores

### Root Cause Analysis

**Issue 1: Processing forever**
`submitClobOrder` in `clobOrderClient.ts` has no timeout. The `@polymarket/clob-client` SDK may hang indefinitely in the browser (it's a Node.js library). No safety timeout exists in OperatorApp or FightPredictions either.

**Issue 2: SDK order call shape**
The current `createAndPostMarketOrder` call looks correct on the surface — it passes `price`, `tokenID`, `amount`, `side`, `tickSize`, `negRisk`, and `OrderType.FOK`. However, two things need verification:
- **EOA funder**: Currently `funder = undefined` for EOA (signatureType 0). Polymarket quickstart shows `funder = signer.address` for EOA mode. This is a concrete suspect.
- The SDK call shape itself matches documented examples (price is included as worst-price limit).

**Issue 3: Live scores/periods/time — the real root cause is slug mismatch**

I verified this with actual database queries:
- Most `polymarket_slug` values in `prediction_fights` are **internal shorthand slugs** like `mlb-cin-min-2026-04-17`, `mls-ner-hou-2026-03-07-hou`
- These are NOT Polymarket's actual market slugs — they were generated during sync
- The Gamma API returns empty results for these shorthand slugs (I tested: `{"games":{}}`)
- The real Polymarket slugs like `will-atlanta-braves-win-the-2026-nl-east-title` DO work with Gamma, but Gamma returns no scores anyway (only `active/closed/resolved` status)
- The Sports WebSocket sends messages with Polymarket's own slug format — which doesn't match the internal shorthand slugs in the DB
- Therefore neither the snapshot NOR the WebSocket can match against the shorthand slugs

This means **live data has been silently broken for all shorthand-slug events** — the WS receives messages but can never match them to tracked slugs.

**Correction per Polymarket docs**: No subscription message is required for the Sports WebSocket. The missing live data is NOT caused by a missing subscribe payload — it's caused by slug mismatch.

---

### Implementation

**PART 1 — Stop processing forever**

File: `src/lib/clobOrderClient.ts`
- Wrap `client.createAndPostMarketOrder()` in a 30-second `Promise.race` timeout
- On timeout, return `errorCode: "sdk_timeout"` with clear diagnostics
- Wrap `new ClobClient()` construction in try/catch to detect SDK init failures separately

File: `src/pages/platform/OperatorApp.tsx`
- Add 60-second overall timeout around the entire CLOB submission block (lines 569-655)
- If timeout fires, force `setSubmitting(false)` and show a clear error toast

File: `src/pages/FightPredictions.tsx`
- Same 60-second overall timeout pattern around CLOB submission block

**PART 2 — Fix SDK order call**

File: `src/lib/clobOrderClient.ts`
- Change EOA funder from `undefined` to `account.address` (the signer's address)
- This matches Polymarket quickstart which shows `signatureType: 0` with `funder: signer.address`
- Keep everything else (price is already passed, negRisk is already passed, FOK is already used)

**PART 3 — Fix live score/period/time via slug mapping**

The core fix: the `live-game-state` edge function and the WS hook need to look up events by `polymarket_market_id` (not slug), and the WS matching needs the **real** Polymarket slug as a secondary matching key.

File: `supabase/functions/live-game-state/index.ts`
- Accept both `slugs` and `market_ids` arrays
- For market IDs, fetch from `https://gamma-api.polymarket.com/markets/{id}` to get the **real** market slug, `gameStartTime`, and market status
- Also look up the market's parent **event slug** via the Gamma response, which is what the Sports WS uses
- Return `{ slug, status, live, ended, realSlug }` — the `realSlug` tells the frontend what slug to listen for on the WS

File: `src/hooks/useSportsWebSocket.tsx`
- In the snapshot seeding effect, also pass `market_ids` (from the fights' `polymarket_market_id`) to the edge function
- When snapshot returns, build a **reverse slug map**: `realSlug → internalSlug` for each tracked fight
- In `parseLiveMessage`, after direct slug match fails, also check the reverse map: if WS message slug matches a `realSlug`, map it back to the internal slug
- Always merge snapshot data over existing state (remove the `if (!next.has(slug))` guard on line 151)
- Log: requested slugs, returned snapshot slugs, first 5 unmatched WS slugs

File: `src/pages/platform/OperatorApp.tsx`
- Pass both `liveSlugs` and `liveMarketIds` to the SportsWebSocketProvider
- Extract `polymarket_market_id` from enriched fights alongside `polymarket_slug`

**PART 4 — Diagnostics for conclusive test**

File: `src/lib/clobOrderClient.ts`
- Log exact `signatureType`, `funder`, `price`, `negRisk`, `orderType` before submission
- On error, capture and log HTTP status and response body snippet
- Include `usedOfficialClient: true` flag

---

### Files Changed
1. `src/lib/clobOrderClient.ts` — timeout + EOA funder fix
2. `src/pages/platform/OperatorApp.tsx` — 60s timeout + pass market IDs
3. `src/pages/FightPredictions.tsx` — 60s timeout
4. `supabase/functions/live-game-state/index.ts` — accept market_ids, resolve real slugs
5. `src/hooks/useSportsWebSocket.tsx` — reverse slug map for WS matching, always merge snapshots

### What Stays Unchanged
- Browser-side order submission architecture
- SDK as the order builder
- Fee collection, reconciliation, operator attribution
- Credential derivation flow
- WebSocket connection logic (no fake subscribe)
- All other UI components

### Expected Outcome
- Processing forever becomes impossible (30s SDK timeout + 60s UI timeout)
- EOA funder fix may resolve "Invalid order payload" if that was the cause
- Live scores/periods should appear once the slug mapping resolves the mismatch between internal shorthand slugs and Polymarket's real slugs

