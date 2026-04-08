

# Fix: Load Privy App ID at Runtime

## Problem
Lovable Cloud blocks `VITE_` prefixed secrets from the secrets panel, and build secrets don't inject into `import.meta.env`. The App ID (`cmlq6g2dn00760cl2djbh9dfy`) is already stored as a runtime secret but the frontend can't access it.

## Solution
Create a backend function that returns the App ID, fetch it when the app boots, then mount the Privy provider with it. No hardcoding needed.

## Changes

### 1. New edge function: `get-privy-config`
- Reads `VITE_PRIVY_APP_ID` from runtime secrets
- Returns `{ appId: "cmlq6g2dn00760cl2djbh9dfy" }`
- Public endpoint (no JWT required) — the App ID is a public client identifier

### 2. Update `src/lib/privyConfig.ts`
- Remove `import.meta.env` read
- Add `fetchPrivyAppId()` — calls edge function once, caches result
- Export a reactive `getPrivyAppId()` that returns the cached value

### 3. Update `src/components/PrivyProviderWrapper.tsx`
- On mount, call `fetchPrivyAppId()`
- Show children without provider while loading (same as current "not configured" behavior)
- Once fetched, mount `PrivyProvider` with the App ID

### 4. Update hooks (`usePrivyLogin.ts`, `usePrivySafe.ts`)
- Read from the new cached config instead of the static `isPrivyConfigured` constant
- Existing safe-return patterns stay the same

## Files
- `supabase/functions/get-privy-config/index.ts` (new)
- `src/lib/privyConfig.ts` (rewrite)
- `src/components/PrivyProviderWrapper.tsx` (update)
- `src/hooks/usePrivyLogin.ts` (minor update)
- `src/hooks/usePrivySafe.ts` (minor update)

## Result
After deploy, the Sign In button on 1mg.live/demo will open the Privy login modal. No manual build configuration needed — the existing runtime secret is used automatically.

