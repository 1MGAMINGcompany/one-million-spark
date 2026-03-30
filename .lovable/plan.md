

## Plan: Add Polite "On Hold" Banner for Backend/Provider Issues

### What Changes

Replace the current technical-sounding "backend timed out" degraded message with a polished, user-friendly banner that reassures users their funds and predictions are safe.

### Changes

**1. `src/pages/FightPredictions.tsx` (lines 854-871)**

Replace the current `backendDegraded && !hasContent` block with a friendlier message:

- Headline: **"All Predictions Are Temporarily On Hold"**
- Body: *"We're experiencing a brief issue with one of our providers. Your funds and existing predictions are completely safe. We're actively working to resolve this — please check back shortly."*
- Keep the Retry button
- Use a shield/lock icon instead of the Swords icon to convey safety
- Add a subtle amber/yellow border to signal "maintenance" rather than "error"

**2. `src/pages/FightPredictions.tsx` — degraded banner when content IS available**

When `backendDegraded && hasContent` (data loaded from before the outage), add a small dismissible banner at the top of the content area:

- *"Some data may be delayed — we're resolving an issue with our providers. Your funds are safe."*
- This way the page still shows cached/stale events but alerts the user

**3. `src/pages/FightPredictionAdmin.tsx`**

Add the same degraded-state handling so the admin panel also shows a polite message instead of infinite loading.

**4. `src/pages/platform/OperatorApp.tsx`**

Add similar degraded-state message for operator white-label apps that hit the same backend.

### Files Changed
- `src/pages/FightPredictions.tsx`
- `src/pages/FightPredictionAdmin.tsx`
- `src/pages/platform/OperatorApp.tsx`

