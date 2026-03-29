

## Plan: Separate 1MG.live Admin Section and Event Visibility

### Problem
Events created for 1mg.live currently also appear on 1mgaming.com. The admin needs a dedicated section for managing 1mg.live platform events separately from flagship events, while sharing the same admin authentication.

### Solution

**1. Add `visibility` column to `prediction_fights`**

New column: `visibility text NOT NULL DEFAULT 'all'`

Values:
- `flagship` — only appears on 1mgaming.com
- `platform` — only appears on 1mg.live (and operator apps)
- `all` — appears everywhere (current default, backward compatible)

Migration:
```sql
ALTER TABLE prediction_fights 
ADD COLUMN visibility text NOT NULL DEFAULT 'all';
```

**2. Filter events by visibility on each frontend**

- **1mgaming.com** (`FightPredictions.tsx`): Add `.in('visibility', ['flagship', 'all'])` to the fights query and also filter out fights with non-null `operator_id`
- **1mg.live / operator apps**: Already filter by operator — platform events query adds `.in('visibility', ['platform', 'all'])`

**3. Create dedicated 1MG.live admin section**

New file: `src/components/admin/PlatformAdminSection.tsx`

A collapsible card section in the existing admin page (like Referrals/Operators sections) containing:
- Platform Event Creator (modified to set `visibility: 'platform'`)
- List of platform-visibility fights with status, pool, and quick actions (close, settle, delete)
- Filter tabs: Active / Settled / All

**4. Update existing admin page layout**

In `FightPredictionAdmin.tsx`:
- Add "1MG.live" nav button next to "Referrals" button
- OR embed the `PlatformAdminSection` as a collapsible section (like Operators)
- Rename current `PlatformEventCreator` to clarify it creates events for the **flagship** site (visibility = `flagship`)

**5. Update `PlatformEventCreator` component**

Add a visibility selector:
- "1MGAMING.com only" → `flagship`
- "1MG.live only" → `platform`  
- "Both" → `all`

Pass the selected visibility to the `createPlatformFight` edge function.

**6. Update `prediction-admin` edge function**

- Accept `visibility` param in `createPlatformFight` action
- Default to `'all'` if not provided (backward compatible)
- Store it on the inserted fight row

### Files Changed

1. **Migration** — Add `visibility` column to `prediction_fights`
2. `supabase/functions/prediction-admin/index.ts` — Accept and store `visibility`
3. `src/pages/FightPredictions.tsx` — Filter fights by visibility for flagship
4. `src/components/admin/PlatformEventCreator.tsx` — Add visibility selector
5. `src/components/admin/PlatformAdminSection.tsx` (new) — Dedicated 1mg.live event management panel
6. `src/pages/FightPredictionAdmin.tsx` — Add Platform Admin section and nav button

