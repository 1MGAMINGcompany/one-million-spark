

## Fix async deadlock in AdminAuth.tsx

**Problem**: The `onAuthStateChange` callback runs an `async` Supabase query (`prediction_admins` lookup) inside itself, causing a known Supabase client deadlock. This makes the page hang forever after a magic link redirect.

**Changes to `src/components/admin/AdminAuth.tsx`**:

1. **Add `authReady` + `authEmail` state** — track whether auth has been restored and the authenticated email.

2. **Call `getSession()` on mount** — restore any existing session immediately, then set `authReady = true`.

3. **Make `onAuthStateChange` synchronous** — only copy `event` and `user.email` into state. No `await` inside the callback.

4. **New separate `useEffect` for admin verification** — runs when `authReady === true && authEmail` is set. Queries `prediction_admins`, creates local session if matched, signs out if not.

5. **Add "Signing you in..." loading state** — shown while auth is restoring after a magic link redirect, before the admin lookup completes.

All existing functionality preserved: hash error handling, explicit production redirect, expired link UI, manage admins panel, 24h local session.

**No changes to `src/App.tsx`** — the root hash redirect stays as-is.

