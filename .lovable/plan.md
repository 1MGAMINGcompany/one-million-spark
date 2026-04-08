

# Audit: Changes from Privy Login Fix Sessions

## Summary
The code changes are **mostly safe for production** (where `VITE_PRIVY_APP_ID` is set), but there is one real regression risk and a few minor issues.

---

## Finding 1 — CRITICAL: Conditional hook call in `useWallet.ts`

Line 22 calls a hook conditionally:
```typescript
const privyState = isPrivyConfigured ? usePrivyInner() : { ... };
```
This violates React's rules of hooks. While `isPrivyConfigured` is a module-level constant (so the call order never actually changes at runtime), this pattern can confuse React's internal hook slot tracking in edge cases with hot module reload or strict mode double-rendering, and may be the source of the `Cannot read properties of undefined (reading 'current')` crash you saw.

**Fix**: Refactor to the same early-return pattern used in `usePrivyWallet`, `usePrivyLogin`, etc.

---

## Finding 2 — MEDIUM: 6 files still call `usePrivy()` directly

These files import and call `usePrivy()` from `@privy-io/react-auth` directly, bypassing the safety guards:

- `src/pages/platform/OperatorApp.tsx` (line 124)
- `src/pages/platform/OperatorOnboarding.tsx` (line 24)
- `src/pages/platform/OperatorDashboard.tsx` (line 33)
- `src/pages/platform/PlatformApp.tsx` (lines 35, 43)
- `src/pages/FightPredictions.tsx` (line 191)
- `src/pages/AddFunds.tsx` (line 209)

When `VITE_PRIVY_APP_ID` is missing, the `PrivyProviderWrapper` skips mounting the provider, and these `usePrivy()` calls crash because there is no context. On your production site (where the env var IS set), this is fine. But on preview/staging builds it will crash.

**Fix**: Wrap these in a safe helper or gate the components behind `isPrivyConfigured`.

---

## Finding 3 — LOW: `PrivyLoginButton` still reads env var directly

Line 8 reads `import.meta.env.VITE_PRIVY_APP_ID` directly instead of using the shared `isPrivyConfigured` from `privyConfig.ts`. Not a bug, but inconsistent with the centralization goal.

---

## Finding 4 — OK: All other changes are clean

- `usePrivyLogin.ts` — correct early-return pattern, error handling is solid
- `usePrivyWallet.ts` — clean, exposes `walletReady` and `hydratingWallet` correctly
- `usePolymarketSession.ts` — correct early-return pattern
- `usePrivySolBalance.ts` — correct early-return pattern
- `PrivyProviderWrapper.tsx` — clean, no hardcoded fallback ID
- `OperatorOnboarding.tsx` and `OperatorDashboard.tsx` — correctly use `usePrivyLogin()` hook

---

## Recommended Fix Plan

1. **Fix `useWallet.ts`** — Refactor the conditional hook into an early-return pattern (split into outer + inner function like the other hooks)
2. **Wrap direct `usePrivy()` calls** — In `OperatorApp`, `PlatformApp`, `FightPredictions`, and `AddFunds`, either:
   - Gate the component behind `isPrivyConfigured`, or
   - Create a safe `usePrivySafe()` wrapper that returns defaults when unconfigured
3. **Minor cleanup** — Use `isPrivyConfigured` in `PrivyLoginButton` instead of reading env var directly

These fixes ensure nothing breaks on preview builds or if the env var is ever missing, while keeping production behavior identical.

