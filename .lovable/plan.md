

## Plan: Fix Duplicate Events — Dedup on Import + Cleanup Tool + DB Constraint

### 1. Add team-name-normalized dedup check in `importSingleEvent`

**File: `supabase/functions/polymarket-sync/index.ts` (after line 924)**

Add a `normalizeTeamName` helper function and a second dedup check after the `conditionId` check. Before inserting a new fight:

1. Normalize `fighter_a_name` and `fighter_b_name` using the provided function (strip prefixes like "the", "fc", "afc", suffixes like "city", "united", etc., lowercase, remove non-alphanumeric)
2. Query `prediction_fights` for any existing fight where:
   - `lower(title) = lower(new_title)` (title-only dedup), OR
   - Same normalized team names in either order AND same `event_date::date`
3. If found, increment `imported` count and `continue` — return success, not error
4. On the `import_bulk` response, mark these as `{ success: true, imported: 0, skipped: "already_exists" }` so the frontend shows them as successful (no error toast)

### 2. Add "Deduplicate Existing" button with preview table

**File: `src/pages/platform/PlatformAdmin.tsx`**

Add a "Deduplicate" button next to "Remove Junk" in the Events Dashboard header. On click:

1. Client-side: group all `fights` by `normalizeTeamName(a) + normalizeTeamName(b)` (sorted) + `event_date::date`
2. Also group by `title.toLowerCase().replace(/\s+/g, '')`
3. Merge both grouping strategies
4. For groups with >1 fight: identify the "keeper" (most predictions via `entryCounts`, or earliest `created_at` if tied)
5. Show a dialog/modal with a preview table: matchup name, duplicate count, which will be kept, which will be deleted
6. On "Confirm", delete duplicates via `prediction-admin` `deleteFight` calls with progress
7. Reload fights after completion

### 3. Add duplicate indicator badges on dashboard rows

**File: `src/pages/platform/PlatformAdmin.tsx`**

Compute a `duplicateSet` (Set of fight IDs that have duplicates) using the same normalization logic. In the events list rendering (line ~721), if a fight's ID is in `duplicateSet`, show a yellow warning badge: `⚠ Duplicate`.

### 4. Database unique constraint migration

**New file: `supabase/migrations/` (new migration)**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_fights_unique_matchup
ON prediction_fights (
  lower(fighter_a_name),
  lower(fighter_b_name),
  event_date::date
)
WHERE operator_id IS NULL 
AND visibility IN ('platform', 'all');
```

This is a partial unique index as a last-resort guard. The application-level check catches it first; this prevents edge cases.

### 5. Handle constraint violations gracefully in edge function

In `importSingleEvent`, wrap the fight insert in a try/catch. If the insert fails with a unique constraint violation (code `23505`), treat it as a successful skip (not an error). Return `{ imported: 0, skipped: "duplicate_constraint" }`.

---

### Technical Details

**`normalizeTeamName` function** (used in both edge function and frontend):
```typescript
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the |fc |afc |cf |as |ac |rc |cd |club |sc )/i, '')
    .replace(/ (fc|sc|cf|afc|city|united|rovers|wanderers|athletic)$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}
```

**Title-only dedup**: Two fights with identical `title` (case-insensitive, whitespace-stripped) are treated as duplicates regardless of fighter name fields.

**Import error fix**: Currently duplicate detection via DB query errors may cause import failures. After this change, all dedup scenarios return success with a skip note.

### Files Changed

1. `supabase/functions/polymarket-sync/index.ts` — Add `normalizeTeamName`, title+team dedup check, graceful constraint handling
2. `src/pages/platform/PlatformAdmin.tsx` — Add Deduplicate button with preview dialog, duplicate badges on dashboard rows, shared `normalizeTeamName`
3. New migration file — Add partial unique index `idx_fights_unique_matchup`

