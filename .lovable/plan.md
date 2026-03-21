

## Time Handling for Predictions: Admin Input + User Display

### Current State
- Admin creates events with `datetime-local` input — this captures the date/time **without timezone info** (browser-local)
- `event_date` is stored as `timestamptz` in the DB, so Postgres assumes UTC if no offset is provided
- Frontend display already uses `formatEventDateTime()` and `formatEventTime()` which call `toLocaleString()` — this **automatically converts to the user's device timezone**
- The admin display in `FightPredictionAdmin.tsx` uses raw `toLocaleString()` in some places and raw `split('T')[0]` in others (inconsistent)

### Problem
1. Admin enters `datetime-local` which has no timezone context — if admin is in EST, the time gets stored ambiguously
2. Admin doesn't know what timezone they're saving in
3. Users see times via `toLocaleString()` which is correct (auto-localizes), but there's no explicit timezone label in all places

### Plan

#### 1. Admin: Add timezone indicator to event creation/edit
- Below the `datetime-local` input, show a helper label: **"Times are saved in your local timezone (EST/EDT/etc.)"** — dynamically detect the admin's timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`
- When sending to the edge function, convert the `datetime-local` value to a proper ISO string with timezone offset so Postgres stores the correct UTC equivalent

#### 2. Optional fight-level time
- Add an optional `scheduled_time` field to the fight edit form (not creation — fights inherit the event time by default)
- This is display-only context, not a new DB column — fights already share the event's `event_date`

#### 3. Frontend display: already correct, minor cleanup
- `formatEventDateTime()` and `formatEventTime()` already use `toLocaleString()` with `timeZoneName: "short"` — this shows "EST", "PST", "CET" etc. based on the user's device. **This is already working correctly.**
- Fix the admin panel's inconsistent date display (line 814: `split('T')[0]`) to also use `formatEventDateTime()` for consistency
- Fix line 2136/2187 which use raw `toLocaleString()` without timezone label

#### 4. No geolocation API needed
- `toLocaleString()` with `timeZoneName: "short"` already uses the device's OS timezone setting — no GPS or IP geolocation required. Users worldwide will automatically see their local time + timezone abbreviation.

### Files to modify
- `src/pages/FightPredictionAdmin.tsx` — Add timezone indicator on create/edit forms, fix inconsistent date displays, convert `datetime-local` to ISO with offset before sending
- `src/lib/formatEventLocalDateTime.ts` — No changes needed (already correct)

### Technical notes
- `datetime-local` → ISO conversion: `new Date(inputValue).toISOString()` handles this, but we should use the more explicit approach of appending the local offset to ensure correctness
- The key insight: **the system already handles user-side localization correctly**. The only fix needed is on the admin input side (timezone clarity) and admin display consistency.

