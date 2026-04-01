

## Two Automation Upgrades

### 1. Quick Approve & Bulk Approve (Admin UI)

**Files:** `supabase/functions/prediction-admin/index.ts`, `src/pages/FightPredictionAdmin.tsx`

**Backend — New actions in `prediction-admin`:**

- **`quickApproveEvent`**: Accepts `event_id`. In one call:
  1. Updates `prediction_events` → `status = "approved"`, `auto_resolve = true`, `admin_approved_at = now()`, `automation_status = "scheduled"`
  2. Updates ALL `prediction_fights` under that event → `trading_allowed = true`, `auto_resolve = true`, `status = "open"` (if not already past open)
  3. Logs to `automation_logs`
  - Works from ANY status (pending_review, draft, etc.) — not just draft

- **`bulkQuickApprove`**: No event_id required. Fetches all events with `status = "pending_review"`, runs the same quickApprove logic on each. Returns count of approved events.

**Frontend — `FightPredictionAdmin.tsx`:**

- Add a **"⚡ Quick Approve"** button on each event card when `event.status === "pending_review"` or `"draft"`. Calls `quickApproveEvent` — one click, event goes live.
- Add a **"Bulk Approve All"** button at the top of the `pending_review` tab. Shows confirmation dialog: "Approve all {count} events? This will make them live immediately." On confirm, calls `bulkQuickApprove`.

---

### 2. Daily Auto-Import via `polymarket-sync`

**File:** `supabase/functions/polymarket-sync/index.ts`

**New `daily_import` action** added to the main handler. When invoked:

1. Iterates through all `LEAGUE_SOURCES` entries, grouped by sport routing rules:
   - **Combat + Soccer leagues** → `visibility = "all"` (both 1mgaming.com and 1mg.live), event `status = "approved"`, fights `trading_allowed = true`
   - **All other sports** (NBA, NHL, MLB, NCAAB, Tennis, Golf, F1, Cricket, Rugby, Chess) → `visibility = "platform"`, event `status = "open"`

2. For each league: fetches events via existing `fetchEventsBySeriesId` / `fetchEventsByTagId` / `fetchSearchEvents` (reuses existing infrastructure), filters with `isAcceptableEvent` + `isDateEligible`, then calls a modified `importSingleEvent` that accepts optional `status_override` and `trading_allowed` params.

3. Dedup is already handled by existing `importSingleEvent` logic (conditionId, title match, normalized names + date).

4. Logs summary to `admin_activity_log` with total counts per sport.

5. The `importSingleEvent` function gets two new optional params:
   - `eventStatusOverride?: string` — sets event status on creation (instead of default "pending_review")
   - `fightTradingAllowed?: boolean` — sets `trading_allowed` on fight insert

**Cron Job:** Created via SQL insert (not migration) to run daily at 6:00 AM UTC:
```sql
SELECT cron.schedule(
  'daily-polymarket-import',
  '0 6 * * *',
  $$ SELECT net.http_post(
    url := '<SUPABASE_URL>/functions/v1/polymarket-sync',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}'::jsonb,
    body := '{"action":"daily_import"}'::jsonb
  ); $$
);
```

**Sport routing map (hardcoded in edge function):**
```text
COMBAT_AND_SOCCER (visibility="all", status="approved"):
  ufc, mma, boxing, bkfc + epl, mls, ucl, uel, la-liga, bundesliga,
  serie-a, ligue-1, liga-mx, copa-libertadores, brazil-serie-a

PLATFORM_ONLY (visibility="platform", status="open"):
  nba, nhl, mlb, ncaab, atp, wta, tennis, golf, f1,
  cricket, cricket-ipl, cricket-psl, cricket-intl, rugby
```

**Summary email** — Not feasible without a configured email domain. Instead, the import summary will be logged to `admin_activity_log` where it's visible in the admin panel. If you want email notifications later, we can add that once an email domain is set up.

---

### Implementation order
1. Add `quickApproveEvent` and `bulkQuickApprove` to `prediction-admin` edge function
2. Add Quick Approve + Bulk Approve UI to `FightPredictionAdmin.tsx`
3. Add `daily_import` action to `polymarket-sync` edge function with sport routing
4. Deploy both edge functions
5. Create the cron job via SQL insert

