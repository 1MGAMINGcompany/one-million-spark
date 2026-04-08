

# Fix: Sign-In Button Does Nothing on 1mg.live/demo

## Root Cause

The `VITE_PRIVY_APP_ID` secret IS configured in the project, but it is only available during the **build process** as an environment variable. The safety guards we added earlier work correctly: when `isPrivyConfigured` is `false`, `usePrivyLogin()` returns a no-op function that silently logs a warning to the console.

The problem is that the no-op is **completely invisible** to the user. When someone taps "Sign In", literally nothing happens — no toast, no feedback, no error. This makes it impossible to diagnose whether:
- The secret didn't reach the build (build-time issue)
- Privy's modal opened but immediately closed (domain/cookie issue — the CNAME was pending)
- The function simply wasn't called

Since you just configured the CNAME and it may now be verified, the fix has two parts:

## What to Fix

### 1. Add visible feedback when login is a no-op
When `isPrivyConfigured` is false, instead of silently warning to console, show a toast to the user so you can immediately tell if the secret is missing from the build.

**File:** `src/hooks/usePrivyLogin.ts`
- Change `noopLogin` from `console.warn(...)` to also call `toast.error("Authentication is not configured for this build.")`

### 2. Add visible feedback when Privy login() is called but nothing happens
Even when Privy IS configured, the modal can fail silently (domain not verified, cookies blocked). Add a timeout-based fallback: if `login()` is called and no `onComplete` or `onError` fires within 5 seconds, show a diagnostic toast.

**File:** `src/hooks/usePrivyLogin.ts`
- In `loginWithDebug`, start a 5-second timeout
- Clear it in both `onComplete` and `onError` callbacks
- If it fires, show: "Login dialog didn't appear. Check domain configuration or try again."

### 3. Add a diagnostic log on app boot
On mount, log whether Privy is configured so you can check the console on 1mg.live to confirm the secret reached the build.

**File:** `src/components/PrivyProviderWrapper.tsx`
- Add a `console.info` at the top: `[Privy] configured=${isPrivyConfigured}, appId=${PRIVY_APP_ID ? "set" : "missing"}`

## Files to Edit
- `src/hooks/usePrivyLogin.ts`
- `src/components/PrivyProviderWrapper.tsx`

## Expected Outcome
After deploying:
- If you see a toast "Authentication is not configured" → the secret isn't reaching the build; we'll fix the build config
- If you see a toast "Login dialog didn't appear" → the CNAME/domain verification is still pending
- If the Privy modal opens → the fix worked and login should proceed normally

