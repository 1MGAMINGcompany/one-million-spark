

# Update Demo Fee to 15% + Add Competitive Messaging

## Changes

### 1. Database: Update demo operator fee to 15%
Run a migration to set `fee_percent = 15` on the `operators` row where `subdomain = 'demo'`.

### 2. `src/pages/platform/LandingPage.tsx`
After the Revenue Calculator section (around line 210, after the closing `</div>` of the calculator card), add a single line of copy:

```
Our own demo app runs at 15%. Set your fee lower and your platform is immediately more competitive — attracting users from day one.
```

Styled as `text-sm text-white/50 text-center mt-4`.

### 3. `src/pages/platform/OperatorOnboarding.tsx`
In the "Fee %" step (line ~203-206, after the existing `<p>` about 1MG's 1.5% platform fee), add:

```
💡 Pro tip: Our demo platform charges 15%. Set your fee to 5% and you'll be 3x more competitive from day one.
```

Styled as `text-xs text-blue-400/80 mt-2`.

## What is NOT changed
- No logic changes to fee calculation, submission, or validation
- No changes to settlement, payouts, auth, routing, or themes

