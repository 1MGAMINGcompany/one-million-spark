

# Fix Privy Login Across All 1mg.live Operator Paths

## Problem
Login calls use `usePrivy().login()` which is fire-and-forget — errors from origin mismatches, disabled methods, or cookie issues are silently swallowed, showing only a generic "unexpected error" in the Privy modal.

## Changes

### 1. New file: `src/hooks/usePrivyLogin.ts`
Create a shared hook using `useLogin` from `@privy-io/react-auth` with:
- `onComplete` — logs user ID, isNewUser, and current origin
- `onError` — maps Privy error codes to specific `sonner` toasts (`allowlist_rejected`, `disallowed_login_method`, `exited_auth_flow`, `client_request_timeout`, default)
- Debug logging of `window.location.origin` and `pathname` on every login attempt

### 2. Replace raw `login()` in 8 files

| File | Current pattern | Change |
|------|----------------|--------|
| `src/components/PrivyLoginButton.tsx` | `usePrivy().login` with try/catch | Use `usePrivyLogin().login`, remove try/catch wrapper |
| `src/components/Navbar.tsx` | `usePrivy().login` assigned to `privyLogin` | Use `usePrivyLogin().login` |
| `src/components/WalletGateModal.tsx` | `usePrivy().login` | Use `usePrivyLogin().login` |
| `src/pages/platform/LandingPage.tsx` | `usePrivy().login` | Use `usePrivyLogin().login` |
| `src/pages/platform/BuyPredictionsApp.tsx` | `usePrivy().login` | Use `usePrivyLogin().login` |
| `src/pages/platform/OperatorApp.tsx` | `usePrivy().login` | Use `usePrivyLogin().login` |
| `src/pages/FightPredictions.tsx` | `usePrivy().login` (5 call sites) | Use `usePrivyLogin().login` |
| `src/pages/AddFunds.tsx` | Already uses `useLogin` but no error handling | Switch to `usePrivyLogin()` |

In each file: remove `login` from `usePrivy()` destructuring, add `import { usePrivyLogin } from "@/hooks/usePrivyLogin"`, call `const { login } = usePrivyLogin()`. Remove all `await login()` patterns — just call `login()` synchronously.

### 3. Simplify `src/components/PrivyProviderWrapper.tsx`
- Remove the hardcoded `loginMethods: ["email", "google", "twitter"]` so Privy dashboard controls available methods
- Keep `appearance`, `defaultChain`, `supportedChains`, and `embeddedWallets` config

### 4. No backend changes
Edge functions, migrations, and admin auth are untouched.

