

## Update CLOB_PROXY_URL to Fly.io Proxy

### Current State
- `CLOB_PROXY_URL` secret exists and currently points to the old Cloudflare Worker
- **9 edge functions** use `getClobUrl()` which reads this secret at runtime:
  1. `prediction-submit`
  2. `prediction-sell`
  3. `prediction-trade-reconcile`
  4. `prediction-health`
  5. `polymarket-auth`
  6. `polymarket-positions`
  7. `polymarket-user-setup`
  8. `polymarket-prices`
  9. `pm-verify-credentials`

### What Needs to Happen

**Step 1 — Update the secret**

Update `CLOB_PROXY_URL` to:
```
https://polymarket-clob-proxy-weathered-butterfly-6155.fly.dev
```

No code changes needed. All 9 functions read the secret at runtime via `Deno.env.get("CLOB_PROXY_URL")`, so they will immediately use the new URL on the next invocation.

**Step 2 — Verify connectivity**

Call the `prediction-health` edge function, which includes a CLOB connectivity test (`/time` endpoint). A successful response confirms the Fly.io proxy is working end-to-end.

**Step 3 — Test a real price fetch**

Call `polymarket-prices` to confirm live market prices update through the new proxy without a 403.

### No Code Changes Required
Every function already has the same pattern:
```typescript
function getClobUrl(): string {
  return Deno.env.get("CLOB_PROXY_URL") || "https://clob.polymarket.com";
}
```
Updating the secret is the only change needed.

