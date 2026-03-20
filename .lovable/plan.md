

## Fix: Prediction Submission Failures

### Two distinct issues to fix

**Issue 1: JWKS fetch failure in `prediction-preflight`** (the error in the screenshot)
The edge function fetches `https://auth.privy.io/.well-known/jwks.json` and it's returning a non-200 response. The `jose` library's `createRemoteJWKSet` throws "Expected 200 OK from the JSON Web Key Set HTTP response" when the JWKS endpoint is unreachable or returns an error.

**Fix:** Add retry logic and a cached JWKS fallback in `prediction-preflight`. If the first fetch fails, retry once after a short delay. This handles transient Privy JWKS outages.

**Issue 2: React crash in `usePolymarketSession`** (runtime error in console)
The error "Should have a queue" at `usePolymarketSession` line 25 is a React hooks violation. The hook `usePrivyWallet` has a conditional early return (`if (!PRIVY_APP_ID) return noPrivy`) BEFORE calling hooks in `usePrivyWalletInner`. When `usePolymarketSession` calls `usePrivyWallet()` and then calls `useWallets()` again separately, the hook count can differ between renders.

**Fix:** Remove the duplicate `useWallets()` call from `usePolymarketSession`. Instead, derive the EOA address from the `wallets` array already available inside the hook via a different approach — or just use a standalone wallet resolution.

### Addressing user requirements

**"Do we need to connect to Polymarket CLOB? I have all the keys"**
If you already have a builder-level API key/secret/passphrase, those can be pre-seeded into `polymarket_user_sessions` for each user, eliminating the SIWE derive step entirely. However, the current architecture derives per-user trading keys so each user has their own CLOB identity.

**"I don't want users to sign a message every time"**
They don't — the SIWE flow only runs once (first prediction). After that, credentials are stored. But the flow currently crashes before it gets there due to issues 1 and 2.

### Plan

**File 1: `supabase/functions/prediction-preflight/index.ts`**
- Add JWKS fetch retry (1 retry with 1s delay) to handle transient Privy endpoint failures
- This directly fixes the screenshot error

**File 2: `src/hooks/usePolymarketSession.ts`**
- Fix the React hooks crash by not duplicating `useWallets()` — use a standalone `useMemo` with wallets from `useWallets()` that's already called once
- The current code already calls `useWallets()` correctly after the previous fix, but the combination with `usePrivyWallet()` (which also calls hooks conditionally) causes the queue error
- Wrap the hook safely: move `useWallets` call to be unconditional at the top level, remove dependency on `usePrivyWallet` for the wallet address (only use it for `isPrivyUser` boolean)

**File 3: `src/pages/FightPredictions.tsx`**
- No structural changes needed — the auto-derive on first prediction is the correct UX (sign once, never again)
- The SIWE signing only happens once per user lifetime, not per prediction

### Post-fix user flow
1. User clicks "Predict" → preflight succeeds (with retry)
2. If first Polymarket prediction: one-time SIWE sign popup → credentials stored
3. All subsequent predictions: no signing, no popups, frictionless
4. Backend handles fee collection + CLOB order submission automatically

### Technical details
- `prediction-preflight`: wrap `jwtVerify` in a retry loop (max 2 attempts)
- `usePolymarketSession`: ensure hooks are called unconditionally to fix React queue error
- No changes to Solana, no refactoring, no UI redesign

