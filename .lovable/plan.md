

## Plan: Platform Admin — Pagination, RPC Stats, Settlement, CSV Export, Activity Log, Bulk Actions

### 1. Database: Create RPC functions + activity log table

**New migration** with:

```sql
-- RPC: fight stats (entry counts, unique predictors, total USD per fight)
CREATE OR REPLACE FUNCTION get_platform_fight_stats()
RETURNS TABLE (fight_id uuid, entry_count bigint, unique_predictors bigint, total_amount_usd numeric)
AS $$ SELECT fight_id, COUNT(*), COUNT(DISTINCT wallet), COALESCE(SUM(amount_usd),0)
FROM prediction_entries pe JOIN prediction_fights pf ON pe.fight_id = pf.id
WHERE pf.visibility IN ('platform','all') AND pf.operator_id IS NULL
GROUP BY fight_id; $$ LANGUAGE sql STABLE;

-- RPC: unique users
CREATE OR REPLACE FUNCTION get_platform_unique_users()
RETURNS bigint AS $$ SELECT COUNT(DISTINCT pe.wallet)
FROM prediction_entries pe JOIN prediction_fights pf ON pe.fight_id = pf.id
WHERE pf.visibility IN ('platform','all') AND pf.operator_id IS NULL; $$ LANGUAGE sql STABLE;

-- Activity log table
CREATE TABLE admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text NOT NULL,
  admin_wallet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_client_writes" ON admin_activity_log FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "public_read" ON admin_activity_log FOR SELECT USING (true);
```

### 2. Server-side pagination for Events Dashboard

**File: `src/pages/platform/PlatformAdmin.tsx`**

Replace `loadFights` with paginated loading:
- Add state: `page` (default 0), `pageSize` (50), `totalFightsCount` (0)
- First query: `SELECT count` via `.select('id', { count: 'exact', head: true })` with same filters
- Second query: `.range(page * 50, (page + 1) * 50 - 1)` for the current page
- Replace `entryCounts` fetch with `supabase.rpc('get_platform_fight_stats')` — store as map of `fight_id -> { entry_count, unique_predictors, total_amount_usd }`
- Show "Showing 50 of 256 events" + Previous/Next buttons below the list
- All filters (status, sport, search) applied server-side via `.eq`/`.ilike` before `.range()`

### 3. Add search bar to Events Dashboard

Add an `Input` field in the filter row. State: `searchQuery`. Apply as `.or()` filter on the Supabase query: `title.ilike.%query%,fighter_a_name.ilike.%query%,fighter_b_name.ilike.%query%`.

### 4. Fix Analytics: unique users + settlement rate

- Call `supabase.rpc('get_platform_unique_users')` and display as a KPI card
- Settlement rate denominator: exclude events where `created_at > now() - 24h`

### 5. Settlement confirmation modal

When clicking settle buttons (A/B), show a Dialog:
- "Settle [Event Name]? Winner: [Fighter A Name]. This will distribute the pool. Cannot be undone."
- On confirm: call `callAdmin("selectResult", ...)`, then log to `admin_activity_log` via `prediction-admin`
- After settling, show winner name next to status badge on event row (already has `winner` field)

### 6. CSV Export

**Events Dashboard**: "Export CSV" button that builds CSV from currently filtered events with columns: Title, Fighter A, Fighter B, Sport, Date, Status, Winner, Predictions, Pool USD, Created At. Uses `Blob` + `URL.createObjectURL` for download.

**Analytics tab**: "Export 30-day Volume" button exporting daily prediction counts.

### 7. Activity Log tab

Add a 4th top-level tab: "Activity Log". On mount, query `admin_activity_log` ordered by `created_at DESC` limit 100. Display as a simple list with timestamp, action icon, and description.

Log entries are written by the `prediction-admin` edge function (will add logging calls for import, settle, delete actions). For now, also log client-side via a new `logAdminAction` helper that inserts via the edge function.

### 8. Bulk status actions

Add checkboxes to event rows in the dashboard. State: `selectedDashboardIds: Set<string>`.

When selections exist, show a toolbar:
- "Lock Selected" — calls `callAdmin("lockPredictions")` for each selected open event
- "Delete Selected" — filters to events with 0 predictions, deletes those, shows toast with count of skipped events that have predictions

### 9. Move Promo Codes + Manual Creator into dashboard tab

Only render `<PromoCodeManager>` and `<PlatformEventCreator>` when `activeTab === "dashboard"`.

### 10. Allow delete on locked events with 0 predictions

Extend delete button visibility from just `f.status === "open"` to include `"locked"` when entry count is 0.

---

### Technical Details

- Pagination uses Supabase `.range()` with `{ count: 'exact' }` for total count
- Search filter uses `.or()` with `ilike` patterns server-side
- RPC functions run as `STABLE` SQL functions — no security definer needed since they only read public-readable tables
- CSV export is pure client-side using filtered data already in memory
- Activity log inserts go through the existing `prediction-admin` edge function (new action: `logActivity`)

### Files Changed

1. New migration — `get_platform_fight_stats` RPC, `get_platform_unique_users` RPC, `admin_activity_log` table
2. `src/pages/platform/PlatformAdmin.tsx` — All UI changes (pagination, search, settlement modal, CSV, activity log tab, bulk actions, tab reorganization)
3. `supabase/functions/prediction-admin/index.ts` — Add `logActivity` action for admin activity logging

