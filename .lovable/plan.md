

## Clean Up and Harden Event Ingestion System

### Problem Summary
The ingestion system currently works but has issues: duplicate-looking events in the UI, no upsert logic on re-import, event metadata (source_provider, source_event_id) not shown in admin cards, and the ingest panel only supports MMA leagues (no Boxing/Muay Thai/Futbol).

### Changes

#### 1. Update `prediction-ingest` Edge Function — Upsert Instead of Skip
Currently, when a `source_event_id` already exists, the function skips it entirely. Change to:
- If existing event found by `source_event_id`: **update** its metadata (event_date, location, organization) instead of skipping, and sync any new fights that don't already exist under that event
- Log action as `event_updated` vs `event_discovered`
- Add a unique constraint on `source_event_id` (where not null) to prevent race-condition duplicates
- Track `events_updated` count in results alongside `events_new` and `events_skipped_dupe`

#### 2. Update `prediction-ingest` — Support Boxing/Muay Thai/Futbol Sources
Currently only uses BALLDONTLIE MMA API. Add support for TheSportsDB sources that already exist in the memory (Boxing league 4445, Top Rank 4875). The function already references TheSportsDB in memory but the code only has BALLDONTLIE. Add a `provider` field to the request body so admin can choose which provider to ingest from, or default to all configured providers.

For non-MMA sports, create events with 0 or 1 child fight/market per event (e.g., a Futbol match = 1 event with 1 market).

#### 3. Update Admin Event Card — Show Source Metadata
Add to the `AdminEventCard` header area:
- Source provider badge (e.g., "BALLDONTLIE", "MANUAL", "THESPORTSDB")
- `source_event_id` shown in small monospace text
- `automation_paused` toggle directly on the card
- Make organization/sport visible as a badge

Update the `PredictionEvent` interface to include: `source`, `source_provider`, `source_event_id`, `automation_paused`, `requires_admin_approval`, `automation_status`.

#### 4. Update Admin Filters — Ensure No Duplicate Cards
The current filter logic can show the same event in multiple sections (e.g., "Active" and "Live" if it has live fights). Fix by making filters mutually exclusive:
- **Live**: has live fights (highest priority)
- **Review**: has review_required fights (but no live)
- **Active**: status = approved, no live, no review
- **Pending**: status = draft
- **Archived**: status = archived
- **Dismissed**: status = dismissed

#### 5. Add Pause/Resume Automation Per-Event
Add admin actions in `prediction-admin` edge function:
- `pauseAutomation` — sets `automation_paused = true` on event
- `resumeAutomation` — sets `automation_paused = false` on event

Add corresponding buttons in `AdminEventCard` for approved events.

#### 6. Update Ingest Panel UI
- Add provider selector chips (BALLDONTLIE, TheSportsDB, or All)
- Show sport category next to each league chip
- Keep dry-run toggle
- Show "updated vs new" counts in results

#### 7. Database Migration
- Add a partial unique index on `prediction_events.source_event_id` (WHERE source_event_id IS NOT NULL) to prevent duplicate imports at the DB level

### Files Changed
- `supabase/functions/prediction-ingest/index.ts` — upsert logic, fight deduplication, TheSportsDB support
- `supabase/functions/prediction-admin/index.ts` — add `pauseAutomation` and `resumeAutomation` actions
- `src/pages/FightPredictionAdmin.tsx` — show source metadata on cards, fix filter mutual exclusivity, add pause/resume buttons, update ingest panel UI, update PredictionEvent interface
- 1 migration — partial unique index on `source_event_id`

### Safety
- No changes to wallet, claim, or settlement logic
- No auto-publishing — all ingested events remain `draft`
- Admin approval still required before public visibility
- All actions logged to `automation_logs`

