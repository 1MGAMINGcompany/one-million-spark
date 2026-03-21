

## Overhaul Admin Event & Fight Management

### Problem
1. **Create Event form** is too basic — missing datetime picker (only date, no time), sport/category dropdown, and venue field
2. **No edit capability** — once created, events and fights cannot be modified (no `updateEvent`/`updateFight` actions exist in the edge function)
3. **No fighter enrichment UI** — fighter photos, records, weight class, venue, referee fields exist in the DB but have no admin UI to populate them
4. **Delete/Archive buttons** don't appear for all event statuses (e.g., approved events with 0 predictions should always show Delete)
5. **BKFC event** needs to be deleted (will do via direct DB query since no delete button is available)

### Plan

#### 1. Delete the orphaned BKFC event
- Query the database to find the BKFC event and delete it along with any associated fights (no predictions exist, so safe)

#### 2. Enhance Create Event form
- Add `datetime-local` input instead of `date` (so admin can set event time)
- Add a **Sport/Category** dropdown: MMA, BOXING, MUAY THAI, BARE KNUCKLE, FUTBOL, OTHER
- Add **Venue** input field
- Store `category` on the event row (column already exists in `prediction_events`)

#### 3. Add `updateEvent` action to edge function
- Accept partial updates: `event_name`, `event_date`, `organization`, `location`, `venue`, `category`, `is_test`
- Audit-log the change

#### 4. Add `updateFight` action to edge function
- Accept partial updates for enrichment fields: `fighter_a_name`, `fighter_b_name`, `fighter_a_photo`, `fighter_b_photo`, `fighter_a_record`, `fighter_b_record`, `weight_class`, `fight_class`, `venue`, `referee`, `enrichment_notes`, `title`, `commission_bps`
- Audit-log the change

#### 5. Add `deleteFight` action to edge function
- Only allow deletion if fight has 0 prediction entries
- Remove the fight row and audit-log

#### 6. Add inline Edit Event panel in AdminEventCard
- When expanded, show an "Edit" button that reveals editable fields for: event name, date/time, organization, location, venue, category
- Save button calls `updateEvent`

#### 7. Add inline Edit Fight panel in AdminFightCard
- Show an "Edit" toggle that reveals editable fields for: title, fighter names, fighter photos (URL inputs), fighter records, weight class, fight class, venue, referee, enrichment notes, commission
- Save button calls `updateFight`
- Delete button (only when 0 predictions) calls `deleteFight`

#### 8. Fix Delete/Archive button visibility
- Show Delete for any event status when there are 0 predictions across all fights
- Show Archive for any non-archived event

### Files to modify
- `supabase/functions/prediction-admin/index.ts` — Add `updateEvent`, `updateFight`, `deleteFight` actions
- `src/pages/FightPredictionAdmin.tsx` — Enhanced Create Event form, inline Edit panels for events and fights, fix button visibility

### Technical details
- The `prediction_events` table already has `category` and `venue` columns
- The `prediction_fights` table already has `fighter_a_photo`, `fighter_b_photo`, `fighter_a_record`, `fighter_b_record`, `venue`, `referee`, `enrichment_notes` columns
- All writes go through the edge function (service role), no RLS changes needed
- Fight interface in admin needs to be extended to include the enrichment fields from the DB

