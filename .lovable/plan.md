
# Fix: Hide Private Rooms from Public Room List + Verify ELO Gating

## ✅ IMPLEMENTED

### Changes Made

**1. Edge Function (`supabase/functions/game-sessions-list/index.ts`)**
- Added new query type `private_room_pdas` that returns PDAs of private rooms
- Query: `mode = 'private'` AND `status IN ('active', 'waiting')`

**2. Frontend Hook (`src/hooks/useSolanaRooms.ts`)**
- Refactored `fetchRooms()` to call `private_room_pdas` FIRST
- Filters out private rooms from on-chain results BEFORE enrichment
- Clear logging: "Fetched X private PDAs to exclude" and "✅ Filtered out X private rooms"

### Flow
1. Frontend calls `game-sessions-list` with `type: 'private_room_pdas'`
2. Edge function returns array of private room PDAs from database
3. Frontend builds `Set<string>` of private PDAs
4. On-chain rooms are filtered: `rooms.filter(r => !privatePdas.has(r.pda))`
5. Remaining public rooms proceed to enrichment with turn times

### ELO Verification (Already Correct)
The `record_match_result` function gates ELO updates correctly:
- `mode = 'ranked'`: ELO updated ✅
- `mode = 'private'`: NO ELO changes ✅
- `mode = 'casual'`: NO ELO changes ✅

### Verification Steps
1. Create a private room
2. Open `/room-list` on another device → Room should NOT appear
3. Use invite link `/room/<pda>` → Room should load and be joinable

