

## Plan: Remove Test Fights and Events

The database currently has 4 prediction events. Three are test events (`is_test = true`) that need to be removed:

1. **BOXING — TEST EVENT Weekend Boxing** (2 fights, 1 with entries)
2. **MMA — TEST EVENT Weekend MMA** (2 fights, both with entries)
3. **MUAY THAI — TEST EVENT Weekend Muay Thai** (2 fights, 1 with entries)

The **Silvertooth Promotions** event is real (`is_test = false`) and stays untouched with all 12 of its fights.

### What will be deleted

- 6 test prediction entries (across 3 settled test fights)
- 6 test fights
- 3 test events

### Steps

1. **Database migration** — Single SQL migration that deletes in dependency order:
   - Delete `prediction_entries` where `fight_id` belongs to test fights
   - Delete `prediction_fights` where `event_id` belongs to test events
   - Delete `prediction_events` where `is_test = true`

No code changes needed — the page already queries and renders whatever is in the database, so removing the test data is sufficient.

