

## Plan: Separate 1MG.live Admin Page + Polymarket Import Fix + event_date Column

### Summary
Create a dedicated `/admin/platform` route for 1MG.live event management, add `event_date` column to `prediction_fights`, add `visibility` support to Polymarket imports, strengthen the winner-market filter, and add visibility badges to the flagship admin.

---

### 1. Database Migration — Add `event_date` to `prediction_fights`

```sql
ALTER TABLE prediction_fights ADD COLUMN event_date timestamptz;
```

Clean column directly on the fights table. No metadata hacks.

---

### 2. New Page: `src/pages/platform/PlatformAdmin.tsx`

A completely separate admin page (not a section inside `FightPredictionAdmin.tsx`) with three sections:

**Section A — Polymarket Browser (Import)**
- Sport tabs: NFL, NHL, NBA, MLB, Soccer, MMA/Combat, Golf
- Each tab calls `polymarket-sync` with `browse_league` for that sport
- Shows results in a table: matchup, date, Polymarket probability, "Already imported" badge
- One-click "Import to 1MG.live" button → calls `import_single` with `visibility: "platform"`
- When a tab returns 0 results: show "No active markets for [sport] right now. Season may be in offseason." with "Add manually" link

**Section B — 1MG.live Events Dashboard**
- Full table of fights where `visibility IN ('platform','all') AND operator_id IS NULL`
- Columns: Sport badge (via `detectSport`), Matchup, Event date, Status badge, Prediction count, Pool total, Visibility badge, Polymarket sync indicator, Action buttons (Lock, Mark Live, Select Result A/B, Settle, Delete)
- Filter tabs: Active / Settled / All
- Search by sport type

**Section C — Manual Fight Creator**
- For Muay Thai, BKFC, bare knuckle (sports Polymarket doesn't cover)
- Sport dropdown: Muay Thai, BKFC, MMA, Boxing
- Fighter A / Fighter B, Event name, Date picker, Draw toggle
- Defaults `visibility: "platform"`
- Reuses `PlatformEventCreator` with `defaultVisibility="platform"` and combat-sport presets

---

### 3. Route Registration

**Flagship app** (`src/App.tsx`): Add route `/admin/platform` → `PlatformAdmin` component inside `AppContent`

**Platform app** (`src/pages/platform/PlatformApp.tsx`): Add route `/admin` → same `PlatformAdmin` behind `RequireActiveOperator` or wallet-based admin check

---

### 4. Update `polymarket-sync` Edge Function

**a) Accept `visibility` on `import_single`:**
```typescript
const { polymarket_event_id, import_source, sport_type, visibility } = body;
// Pass to importSingleEvent
```

**b) Update `importSingleEvent` signature** to accept `visibility` param, default `"all"`. Apply it to the fight insert:
```typescript
await supabase.from("prediction_fights").insert({
  ...existingFields,
  visibility: visibility || "all",
  event_date: timeInfo.chosen || gEvent.startDate || null,
});
```

**c) Strengthen winner-market filter** — add these reject keywords to `PROP_KEYWORDS` or the market-level skip logic:
```
"ko", "knockout", "goals", "points", "rounds", "total", "margin", "first", "how many", "player props", "stoppage", "decision", "submission"
```
Also reject markets with more than 3 outcomes.

---

### 5. Update `prediction-admin` Edge Function

In `createPlatformFight`, store `event_date` on the fight row (it's already received but only logged):
```typescript
// Add to the insert payload:
event_date: event_date || null,
```

---

### 6. Add Visibility Badge to Flagship Admin

In `FightPredictionAdmin.tsx` `AdminFightCard` (~5 lines):
- Add `visibility` to the `Fight` interface
- Show colored badge: Blue "1MG.live" / Green "Both" / Yellow "Flagship"

---

### 7. Remove `PlatformAdminSection` from `FightPredictionAdmin.tsx`

Since we're creating a separate page, remove the embedded collapsible section and its import. Keep the flagship admin focused on 1mgaming.com events only.

---

### Files Changed

1. **Migration** — Add `event_date` column to `prediction_fights`
2. `src/pages/platform/PlatformAdmin.tsx` (new) — Full separate admin page
3. `src/App.tsx` — Add `/admin/platform` route
4. `src/pages/platform/PlatformApp.tsx` — Add `/admin` route for platform context
5. `supabase/functions/polymarket-sync/index.ts` — Accept `visibility`, store `event_date` on fights, strengthen prop filter
6. `supabase/functions/prediction-admin/index.ts` — Store `event_date` on `createPlatformFight`
7. `src/pages/FightPredictionAdmin.tsx` — Remove `PlatformAdminSection`, add visibility badge to fight cards
8. `src/components/admin/PlatformAdminSection.tsx` — Delete (replaced by full page)

