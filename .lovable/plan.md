

## Plan: Harden swap-to-usdce Edge Function

### Problem
The function crashes with `SyntaxError: Unexpected token 'U'` because `res.json()` is called on a non-JSON response from 0x. The response is likely plain text like "Unauthorized" or "Unrecognized request".

### Changes — single file: `supabase/functions/swap-to-usdce/index.ts`

**1. Safe JSON parsing (both `quote` and `price` actions)**

Replace every `const data = await res.json()` with:
```typescript
const raw = await res.text();
let data: any;
try {
  data = JSON.parse(raw);
} catch {
  console.error("[swap-to-usdce] 0x non-JSON response:", raw.slice(0, 200));
  return new Response(
    JSON.stringify({ error: "Swap service unavailable", details: raw.slice(0, 200) }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**2. Request URL + response logging**

Before each fetch, log the full URL:
```typescript
const url = `https://api.0x.org/swap/permit2/quote?${params}`;
console.log("[swap-to-usdce] 0x request:", url);
```
After reading raw response:
```typescript
console.log("[swap-to-usdce] 0x response status:", res.status, "body:", raw.slice(0, 200));
```

**3. Correct headers (already correct, but remove `0x-version` noise)**

Current headers already use `"0x-api-key"` correctly. Will also add `"Content-Type": "application/json"` for completeness:
```typescript
headers: {
  "0x-api-key": ZEROX_API_KEY,
  "Content-Type": "application/json",
}
```
No `Authorization` header. No `0x-version` header (not required by current v2 API and could cause issues).

**4. Fallback endpoint for testing**

If the permit2 endpoint returns a non-200, attempt `/swap/v1/quote` as fallback before returning error. This provides a diagnostic path if the permit2 endpoint is the issue.

### Summary of locations changed
- Lines 53-68 (quote fetch + parse) — safe parse + logging + fallback
- Lines 98-112 (price fetch + parse) — safe parse + logging

No database changes. Auto-deployed on save.

