

# Fix CORS Headers for Edge Functions

## Problem
Browser requests from `https://1mgaming.com` to `/functions/v1/health` and `/functions/v1/get-moves` are blocked by CORS preflight failures.

## Root Cause
The `corsHeaders` object is missing:
1. **`Access-Control-Allow-Methods`** - browsers need this to know which HTTP methods are allowed
2. **Extended Supabase headers** - the Supabase JS client sends additional headers that must be whitelisted

## Solution
Update `corsHeaders` in both files to include all required headers.

---

## Changes

### File 1: `supabase/functions/health/index.ts`

**Before (lines 3-6):**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

**After:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
```

---

### File 2: `supabase/functions/get-moves/index.ts`

**Before (lines 4-7):**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

**After:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
```

---

## Technical Details

| Header | Purpose |
|--------|---------|
| `Access-Control-Allow-Methods` | Tells browser which HTTP methods are allowed (GET, POST, OPTIONS) |
| `x-supabase-client-platform` | Supabase JS client sends this header automatically |
| `x-supabase-client-platform-version` | Client version info |
| `x-supabase-client-runtime` | Runtime environment (browser/node) |
| `x-supabase-client-runtime-version` | Runtime version |

If these headers are not whitelisted in `Access-Control-Allow-Headers`, the preflight OPTIONS request fails and the actual request is blocked.

---

## Verification

After deployment, test with:
```bash
curl -X OPTIONS https://mhtikjiticopicziepnj.supabase.co/functions/v1/health \
  -H "Origin: https://1mgaming.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type, x-supabase-client-platform" \
  -v
```

Should return `200 OK` with proper CORS headers.

