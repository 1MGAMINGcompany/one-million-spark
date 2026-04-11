

## Fix: Fly.io Proxy POST /order Still Getting Geo-Blocked

### Diagnosis
The logs confirm:
- `getClobUrl()` correctly returns the Fly.io proxy URL
- GET requests through the proxy work (health check, price fetch)
- POST `/order` returns 403 geo-block

The proxy is deployed with `auto_stop_machines = "stop"` and Fly.io anycast routing. When the Supabase edge function (running in `eu-central-1`) connects to `polymarket-clob-proxy-weathered-butterfly-6155.fly.dev`, Fly's anycast may route to a European edge, or the stopped machine may restart in a non-iad region.

Additionally, the current proxy code sets `headers["host"] = "clob.polymarket.com"` but does NOT strip the `origin` or `referer` headers, which Polymarket may inspect on authenticated POST endpoints.

### Fix (External Proxy Changes)

**1. Update `fly-clob-proxy/server.js`** — Strip additional headers and add diagnostic logging:

```js
// Add to STRIP set:
"origin", "referer", "x-deno-execution-id", "x-deno-subhost"
```

**2. Update `fly-clob-proxy/fly.toml`** — Force single-region deployment:

```toml
app = "polymarket-clob-proxy-weathered-butterfly-6155"
primary_region = "iad"

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"     # prevent cold-start in wrong region
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
```

Key change: `auto_stop_machines = "off"` ensures the machine stays alive in `iad` and doesn't get recreated in a different region.

**3. Add a POST test endpoint to the proxy** for debugging:

Add a `/debug` path that returns the machine's region and outbound IP so we can confirm the egress is from a US IP.

**4. Redeploy the proxy:**
```bash
cd fly-clob-proxy
fly deploy
fly status  # confirm machine is in iad
```

**5. Verify with a direct POST test:**
```bash
curl -X POST https://polymarket-clob-proxy-weathered-butterfly-6155.fly.dev/order \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

This should return a Polymarket error about invalid order format (not 403 geo-block). If it still returns 403, the issue is Fly's outbound IP being flagged, and we'd need to use a dedicated IPv4 (`fly ips allocate-v4`).

### Files to Create/Update (External)
- `fly-clob-proxy/server.js` — strip origin/referer/deno headers
- `fly-clob-proxy/fly.toml` — disable auto_stop, force iad

### No Project Code Changes Needed
The edge functions are already correctly using `getClobUrl()`.

### Test After Fix
1. `fly status` — confirm single machine in `iad`
2. `curl -X POST .../order` — confirm NOT 403
3. Place a $1 prediction on 1mg.live/demo — should succeed or fail with a non-geo error

