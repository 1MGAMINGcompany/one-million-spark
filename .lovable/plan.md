

## Plan: Fix Prediction Submission Failures

### Root Cause Analysis

After a full audit, here's what I found:

**Database is correctly configured:**
- All current fights have `trading_allowed: true` in the database
- System is in `allowlist` mode and the admin toggle works
- Events have correct timestamps and statuses

**The actual problem:** The prediction submission never reaches the backend. Zero logs in `prediction-preflight` or `prediction-submit`. This means the failure happens client-side before any API call is made. Two likely causes:

1. **Privy `getAccessToken()` returning null** — If the Privy session has expired or isn't fully initialized, line 354-357 throws "Unable to get authentication token" immediately
2. **Silent button blocking** — When `handlePredict` fires on line 497, if `fight.status !== "open"` it does a silent `return` with no feedback to the user. Some fights were auto-locked by the schedule worker.

### Fixes (4 changes)

**1. Add error feedback when predict button is silently blocked**
- File: `src/pages/FightPredictions.tsx` — `handlePredict` function
- When `fight.status !== "open"`, show a toast: "This market is locked — predictions are closed" instead of silently returning
- When `getAccessToken()` fails, offer a "Re-login" action in the toast

**2. Add visible loading/error states for Privy auth**
- File: `src/pages/FightPredictions.tsx` — `handleSubmit` function
- Wrap `getAccessToken()` in a try-catch with a descriptive toast: "Session expired — please log in again"
- Add a retry mechanism: if token is null, call `login()` automatically and retry once

**3. Show locked status more clearly on fight cards**
- File: `src/components/predictions/FightCard.tsx`
- When a fight is `locked` (either from DB or from `eventHasStarted` override), show "Predictions Closed" text on the predict buttons instead of just disabling them silently

**4. Add client-side console logging for debugging**
- File: `src/pages/FightPredictions.tsx`
- Add `console.log` breadcrumbs at each step of `handleSubmit` so future failures can be diagnosed from console logs

### Technical Details

```text
Current flow:
  User clicks Predict → handlePredict checks status → (silent return if locked)
                       → handleSubmit → getAccessToken() → (throws if null)
                       → preflight → (throws if fails)
                       → allowance check → submit

Proposed flow:
  User clicks Predict → handlePredict checks status → (TOAST if locked)
                       → handleSubmit → getAccessToken() → (TOAST + re-login if null)
                       → preflight → (TOAST with retry suggestion)
                       → allowance check → submit
                       → console.log at each step for audit trail
```

### Files to edit
1. `src/pages/FightPredictions.tsx` — Add toasts for silent failures, auth retry, console logging
2. `src/components/predictions/FightCard.tsx` — Show "Predictions Closed" on locked fight buttons
3. `src/components/predictions/EventSection.tsx` — Show locked fight count alongside open count

