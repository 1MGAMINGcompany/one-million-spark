

## Plan: Remove Unreliable Privy API Call from Auth Verification

### Problem
Both `prediction-preflight` and `prediction-submit` are failing with `401 Invalid app ID or app secret` when calling `https://api.privy.io/v1/users/{did}`. The stored `PRIVY_APP_SECRET` is not matching. This blocks every prediction attempt.

### Solution
The edge functions already perform thorough local JWT validation:
- Checks JWT structure (3 parts)
- Verifies `iss === "privy.io"`
- Verifies `aud === appId` (matches the app ID used