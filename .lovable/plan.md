

## Plan: Register polymarket-sync Edge Function in Config

### Problem
The "Import from Polymarket" panel already exists in the admin dashboard (`FightPredictionAdmin.tsx` lines 449-458, component at lines 1842-2043) with full functionality:
- **Sync by tag** (sports, politics, crypto, etc.)
- **Search by keyword** with Enter key support
- **Import single event** with per-result Import button
- **Refresh prices** for active markets
- Success/error feedback via toast notifications

However, the `polymarket-sync` edge function is **missing from `supabase/config.toml`**, so it defaults to requiring JWT verification. Since the admin dashboard calls it without a JWT (using wallet-based admin verification instead), all calls will fail with auth errors.

### Fix
Add `polymarket-sync` to `supabase/config.toml` with `verify_jwt = false` (matching the pattern used by every other edge function in this project). The function already has its own admin verification via the `prediction_admins` table.

### File to change
- `supabase/config.toml` — add `[functions.polymarket-sync]` section with `verify_jwt = false`

### Where the button appears
The Polymarket Sync panel is located in `/predictions/admin`, between the "Event Ingest" card and the "Create Event" card. It contains:
1. **Tag chips** (sports, politics, crypto, entertainment, science) to select a category
2. **"Sync [tag]"** button — fetches and upserts all active markets for that tag as drafts
3. **"Refresh Prices"** button — updates prices for already-imported active markets
4. **Search bar** — type a keyword, press Enter or click the eye icon to search Polymarket
5. **Import buttons** — each search result has an "Import" button to import that single event

### Import behavior
- **Events** are imported with `status: "draft"` and `requires_admin_approval: true`
- **Fights/markets** are imported with `status: "open"`, `source: "polymarket"`, and `commission_bps: 200` (2%)
- Events appear in the "Pending" filter tab after import, requiring admin approval before going live

### Technical details
No code changes needed beyond the config.toml registration. The edge function (`polymarket-sync`) already handles admin wallet verification server-side by checking the `prediction_admins` table.

