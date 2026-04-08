

# Fix Privy Login for All Operator Paths on 1mg.live

## Analysis

Your Privy allowed origins configuration looks correct. All operator apps like `https://1mg.live/demo` or `https://1mg.live/newoperator` use **path-based routing**, meaning the browser origin is always `https://1mg.live` -- which is already in your allowlist. New operator subdomains do NOT require any Privy dashboard changes because they all share the same origin.

The real problem is the **HttpOnly cookies** section in your Privy dashboard:

- **App domain** is set to `1mgaming.com` with status **"Pending"**
- This means Privy is trying to set secure cookies scoped to `1mgaming.com`, but the required DNS CNAME record (`privy.1mgaming.com → cmlq6g2dn00760cl2djbh9dfy.api.privy.systems`) has not been verified yet
- When accessing from `1mg.live` or `lovable.app` domains, the cookie domain mismatch causes authentication to fail silently with a generic "unexpected error"

## Required Fix (Privy Dashboard -- you must do this)

**Option A (recommended):** Temporarily **disable HttpOnly cookies** by toggling it off in the Privy dashboard. This will let login work on ALL origins immediately (`1mg.live`, `1mgaming.com`, `lovable.app`). You can re-enable it later once DNS is configured.

**Option B:** Add the CNAME DNS record that Privy requires:
- **Type:** CNAME  
- **Name:** `privy` (i.e., `privy.1mgaming.com`)  
- **Value:** `cmlq6g2dn00760cl2djbh9dfy.api.privy.systems`  
- Add this in your domain registrar for `1mgaming.com`
- Note: this only fixes `1mgaming.com` -- for `1mg.live` to also work with HttpOnly cookies, you would need to add a second app domain entry for `1mg.live` with its own CNAME

## Code Change (improve error visibility)

**File:** `src/components/PrivyProviderWrapper.tsx`
- Add an `onError` handler to the `PrivyProvider` config that logs the actual Privy error to the console and optionally shows a toast, so future failures surface the real reason instead of "unexpected error"

## Why New Operators Work Automatically

Since all operators use path-based routing (`1mg.live/slug`), the browser origin is always `https://1mg.live`. Privy validates origins, not paths. So `https://1mg.live` in the allowlist covers every current and future operator app -- no per-operator configuration needed.

