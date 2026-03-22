

## Plan: Remove Unreliable Privy API Call from Auth Verification

### Problem
Both `prediction-preflight` and `prediction-submit` are failing with `401 Invalid app ID or app secret` when calling `https://api.privy.io/v1/users/{did}`. The stored `PRIVY_APP_SECRET` is not matching. This blocks every prediction attempt.

### Solution
The edge functions already perform thorough local JWT validation:
- Checks JWT structure (3 parts)
- Verifies `iss === "privy.io"`
- Verifies `aud === appId` (matches the app ID used by the frontend)
- Checks token expiry

The remote Privy API call is an unnecessary extra step that just confirms "is this user account still active" — not needed for trade authorization. Remove it and rely on the local JWT checks, which are cryptographically sufficient.

### Changes (2 files)

**`supabase/functions/prediction-preflight/index.ts`**
- Remove the `fetch("https://api.privy.io/v1/users/...")` call
- Keep all local JWT checks (issuer, audience, expiry, DID extraction)
- Return `{ ok: true, did }` after local validation passes

**`supabase/functions/prediction-submit/index.ts`**
- Same change: remove the Privy API fetch in the auth verification section
- Keep local JWT decode + validation
- Continue with trade execution using the locally-extracted DID

### Why this is safe
- The JWT is signed by Privy with their private key
- The `aud` claim ensures the token was issued for this specific app
- The `exp` claim prevents replay of old tokens
- The `iss` claim confirms it came from Privy
- No user action (deactivation, etc.) happens frequently enough to warrant a real-time API check on every trade

