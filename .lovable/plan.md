

## Redesign Polymarket Admin: Preview-First Import Flow

### Problem
The current admin sync panel has three broken/confusing import paths:
1. **Series browsing** returns political/irrelevant data from corrupted Polymarket `/sports` endpoint
2. **Bulk sync** auto-imports hundreds of events without preview, most are wrong
3. **Search** returns "no results" for valid sports queries

The admin needs a simple, reliable way to find and hand-pick soccer matches and MMA/boxing fights.

### New Design: Search + Preview + Select

Replace the entire Polymarket Sync panel with a cleaner two-section layout:

**Section 1: Direct URL Import** (keep, works well)
- Paste a Polymarket event URL → preview the event details + markets → confirm import

**Section 2: Search + Preview** (rewrite)
- Search box with sport-type filter chips: `Soccer`, `UFC/MMA`, `Boxing`, `All`
- Results appear as preview cards showing: title, start date, market count, prices
- Each card has a checkbox for selection
- "Import Selected" button at the bottom imports only checked events
- Events import as **`pending_review`** status (new status value) — distinct from `draft`

**Remove entirely:**
- Browse Sports (series-based) dropdown + "Sync {league}" button
- Tag selector chips (All/Soccer/UFC/Boxing with series/search hints)
- Limit control
- Bulk sync button
- `browse_sports` action from edge function

### New `pending_review` Status

Add a new event status `pending_review` between import and draft:
- Imported events land as `pending_review`
- Admin sees them in a new "Review" tab (rename existing review tab to "Fight Review")
- Admin can preview markets, then promote to `draft` (which enters the existing approval flow) or dismiss

**No DB migration needed** — `status` is a text column, we just use a new string value.

### Changes

**File: `src/pages/FightPredictionAdmin.tsx`**

1. **Rewrite `PolymarketSyncPanel`**: Remove series browsing, tag chips, limit control, bulk sync. Replace with:
   - Sport filter chips: `Soccer`, `UFC/MMA`, `Boxing` (these set the search context)
   - Search input + preview button
   - Results grid with checkboxes for multi-select
   - "Import Selected to Review" button
   - Direct URL import (keep as-is)

2. **Update `getEventBucket`**: Route `pending_review` status to a "Pending Review" bucket, separate from drafts.

3. **Add review actions**: For `pending_review` events, show "Approve to Draft" and "Dismiss" buttons.

**File: `supabase/functions/polymarket-sync/index.ts`**

4. **Remove `browse_sports` action** and the `sync` action entirely (no more bulk auto-import).

5. **Improve `search` action**: Remove the broken series-based Step 1. Use only:
   - For soccer queries: `/public-search` filtered by `isActualFixture` + `isFutureEvent`
   - For combat queries: `/public-search` with combat keywords appended
   - Return preview-only data (no DB writes during search)

6. **Update `import_single`**: Set imported events to `pending_review` instead of `draft`.

7. **Update `import_by_url`**: Same — use `pending_review` status for new events.

8. **Remove `sync` action code** (~150 lines of series fetching + bulk upsert logic).

### Admin Flow After Changes

```text
Admin types "FIFA Friendlies" → selects Soccer chip
  → Search hits /public-search, filters for "vs" + future dates
  → Shows 5 matching fixtures as preview cards with checkboxes
  → Admin checks 3 they want → clicks "Import Selected"
  → 3 events created as pending_review
  → Admin goes to "Pending Review" tab → reviews each → promotes to Draft
  → Draft events enter existing approval pipeline
```

### Technical Detail

- Search filtering uses existing `isActualFixture()` + `isFutureEvent()` — no series API calls
- Multi-select import calls `import_single` for each selected event
- `pending_review` events appear in a dedicated tab with approve/dismiss actions
- The `sync` and `browse_sports` actions are removed from the edge function (dead code cleanup)

