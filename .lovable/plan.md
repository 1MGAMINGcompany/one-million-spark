
Fix plan for the `/demo` crash

Do I know what the issue is? Yes.

This is now a different failure from the earlier “Pending” login setup. The app is crashing before the login flow even starts. Based on the current code, the most likely root cause is: Privy hooks are being mounted without a valid Privy provider/config.

Why this is the likely source:
- `/demo` renders `PlatformApp -> OperatorApp`, not the chess/3D path, so the react-three issue is not the first thing to fix here.
- `src/components/PrivyProviderWrapper.tsx` currently skips the provider when `VITE_PRIVY_APP_ID` is missing and still renders the app.
- `OperatorApp`, `PlatformApp`, `usePolymarketSession`, and `usePrivyLogin` call Privy hooks unconditionally.
- The env excerpt you shared does not include `VITE_PRIVY_APP_ID`, which matches this exact crash pattern.

Files to fix:
- `src/components/PrivyProviderWrapper.tsx`
- `src/pages/platform/PlatformApp.tsx`
- `src/pages/platform/OperatorApp.tsx`
- `src/hooks/usePolymarketSession.ts`
- `src/hooks/usePrivyLogin.ts`
- `src/hooks/usePrivyWallet.ts`
- `src/hooks/usePrivySolBalance.ts`

Implementation plan:
1. Replace the silent fallback in `PrivyProviderWrapper`.
   - If `VITE_PRIVY_APP_ID` is missing, render a clear configuration screen instead of `children`.
   - Add one debug event so the failure is obvious in logs.

2. Make Privy-dependent hooks safe.
   - Convert `usePolymarketSession` and `usePrivyLogin` to the same outer-wrapper pattern already used in `usePrivyWallet`.
   - Return no-op/default state when Privy is not configured so hooks never crash the route.

3. Gate platform/operator rendering.
   - In `PlatformApp` / `OperatorApp`, do not mount auth/trading flows until Privy is configured and ready.
   - Show a simple loading/config state instead of rendering the full operator app immediately.

4. Remove remaining hidden fallback behavior.
   - Remove the hardcoded fallback app ID in `src/hooks/usePrivySolBalance.ts`.
   - Use one shared `isPrivyConfigured` helper everywhere.

5. Verify the real failing paths.
   - Test `/demo`, `/buy-predictions-app`, `/onboarding`, and `/dashboard`.
   - Expected result: no global crash on first render.
   - If config is missing, the app should show a clear auth configuration message.
   - If config is present, the next error will surface cleanly and we can fix the real auth/login issue from there.

Technical note:
- I specifically checked the react-three angle from the error hint. The only `Canvas`/`@react-three/fiber` code is in the chess cinematic path, which is not part of `/demo`, so that is not the primary issue here.
- You do not need to wait a few hours for this crash; DNS “Pending” can block login, but it does not explain this immediate render error.
