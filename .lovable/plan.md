
Goal: make the Privy failure diagnosable, remove false login loops, and get login working reliably on `1mg.live` operator paths.

Do I know what the issue is? Yes.

What the audit shows
- The repeated “unexpected error” is most likely coming from Privy rejecting the current origin/app-ID/cookie setup, not from your React UI itself.
- Privy’s docs confirm:
  - allowed URLs are exact origins, not paths
  - `https://1mg.live/demo` only needs the origin `https://1mg.live`
  - once a production app ID is configured to use HttpOnly cookies on a production domain, that same app ID is not suitable for preview/staging unless you use a separate dev app ID or app client
- The codebase still has frontend issues that make this harder to see and can create fake “not logged in” states:
  1. hardcoded Privy app ID fallback exists in multiple files, so the app can silently use the wrong app ID everywhere
  2. raw login entry points still exist in `src/pages/platform/OperatorOnboarding.tsx` and `src/pages/platform/OperatorDashboard.tsx`
  3. auth state is still coupled to wallet hydration in key places, so a user can be authenticated but still shown login UI while the embedded wallet is still loading

Implementation plan

1. Add real auth diagnostics
- Upgrade `src/hooks/usePrivyLogin.ts` to write auth events into the existing debug ring buffer, not just `console.log`.
- Log:
  - origin
  - hostname
  - pathname
  - Privy error code
  - `ready`
  - `authenticated`
  - linked-account count
  - wallet count
- Use the existing `?debug=1` + DebugHUD flow so copied logs finally show where auth is failing.

2. Remove silent app-ID fallback
- Stop defaulting to the hardcoded Privy app ID in:
  - `src/components/PrivyProviderWrapper.tsx`
  - `src/hooks/usePrivyWallet.ts`
  - `src/hooks/useWallet.ts`
  - `src/components/PrivyLoginButton.tsx`
- If the current environment has no valid app ID configured, show a clear local config error instead of attempting login with a likely-wrong production ID.

3. Finish centralizing login
- Replace raw `usePrivy().login` usage in:
  - `src/pages/platform/OperatorOnboarding.tsx`
  - `src/pages/platform/OperatorDashboard.tsx`
- Remove or reroute the raw `privyLogin` export inside `src/hooks/useWallet.ts` so future code cannot bypass centralized error handling.

4. Separate authentication from wallet readiness
- Extend `src/hooks/usePrivyWallet.ts` to expose wallet hydration state, e.g.:
  - `walletReady`
  - `hydratingWallet`
- Update these files so `authenticated === true` but wallet not ready shows a loading/setup state instead of a login prompt:
  - `src/components/PrivyLoginButton.tsx`
  - `src/pages/AddFunds.tsx`
  - `src/pages/FightPredictions.tsx`
  - `src/pages/platform/OperatorApp.tsx`
- This removes false “sign in again” loops after successful auth.

5. Align domain/config behavior with the routing model
- Current operator routing is path-based, so this is enough for all operator apps:
```text
https://1mg.live -> covers /demo, /abc, /new-operator
```
- Confirm or add exact allowed origins only where needed:
  - `https://1mg.live`
  - `https://www.1mg.live` if used
  - `https://1mgaming.com`
  - `https://www.1mgaming.com` if used
- If you want Privy to work on preview/published Lovable domains too, do not rely on the same production cookie-enabled app ID there.
- Use one of these fixes:
  - disable HttpOnly cookies for this shared multi-origin setup, or
  - use separate Privy app IDs / app clients for production vs preview/dev

6. Verify with a simple origin matrix
- Test login on:
  - `https://1mg.live/`
  - `https://1mg.live/demo`
  - your published domain if intentionally supported
  - your preview domain only if separately configured
- Expected result after the fix:
  - either login succeeds
  - or the app shows a specific mapped error and debug log, not a vague loop

Files to change
- `src/hooks/usePrivyLogin.ts`
- `src/components/PrivyProviderWrapper.tsx`
- `src/hooks/usePrivyWallet.ts`
- `src/hooks/useWallet.ts`
- `src/components/PrivyLoginButton.tsx`
- `src/pages/AddFunds.tsx`
- `src/pages/FightPredictions.tsx`
- `src/pages/platform/OperatorApp.tsx`
- `src/pages/platform/OperatorOnboarding.tsx`
- `src/pages/platform/OperatorDashboard.tsx`

Technical details
- `1mg.live/demo` is not a separate domain; it is still the `https://1mg.live` origin.
- Generic preview wildcards are not a safe Privy strategy; preview support should use exact preview origins or a separate development app/client.
- Frontend fixes will make the source obvious and stop false re-prompts, but the modal-level “unexpected error” will continue until the Privy origin/cookie configuration matches the domain being tested.
