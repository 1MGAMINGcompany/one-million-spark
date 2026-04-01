

## Create demo.1mg.live — Live Demo Operator App

The demo is simply an operator record in the database with subdomain `"demo"`. The existing `OperatorApp.tsx` + domain detection already handles everything. No code changes needed.

### Steps

**1. Insert demo operator record (database)**

Insert into `operators` table:
- `subdomain`: `"demo"`
- `brand_name`: `"1MG Demo"`
- `status`: `"active"`
- `fee_percent`: `5`
- `theme`: `"gold"`
- `user_id`: your Privy DID (platform owner)

Insert into `operator_settings`:
- `allowed_sports`: empty array `{}` (empty = show ALL sports, since the filter skips when length is 0)
- `show_polymarket_events`: `true`
- `show_platform_events`: `true`

**2. DNS setup (Cloudflare — manual or automated)**

Add these records at your Cloudflare dashboard for the `1mg.live` zone:
- **A record**: `demo` → `185.158.133.1` (proxied/orange cloud ON)
- **TXT record**: `_lovable.demo` → your Lovable verification value

If you already have a wildcard `*.1mg.live` A record pointing to `185.158.133.1`, the DNS is already done and `demo.1mg.live` will resolve automatically.

Then add `demo.1mg.live` as a custom domain in Lovable Project Settings → Domains (with "Cloudflare proxy" option enabled).

**3. Update landing page demo link**

The landing page already has a "View Live Demo" link. We just need to make sure it points to `https://demo.1mg.live`.

**4. Fee routing**

The 5% operator fee is already handled by the existing prediction flow. When a user places a prediction on an operator app, the `prediction-submit` edge function checks `source_operator_id`, looks up the operator's `fee_percent`, and records revenue in `operator_revenue`. Since this is YOUR demo operator, the fees accrue to the demo operator record. Platform fee (1.5%) is collected separately as usual.

### What already works (no code changes)
- Domain detection → `demo.1mg.live` → `{ type: "operator", subdomain: "demo" }`
- `useOperatorBySubdomain("demo")` fetches the operator record
- All platform events + operator events display automatically
- Empty `allowed_sports` = all sports shown
- Privy auth, prediction placement, share buttons all work
- Revenue tracking at 5% fee

### Summary
This is a **data-only setup** — insert 2 rows + configure DNS. No code changes required. The existing system handles everything.

