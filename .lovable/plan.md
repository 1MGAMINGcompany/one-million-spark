
# PRIVATE ROOMS — STEP 2 (BACKEND)

## Overview
Enable server-side support for `mode="private"` so that:
1. Private rooms are persisted correctly in the database
2. Private rooms are excluded from the public room list
3. Private rooms remain joinable via direct link and visible to their owner

## Architecture

The room list uses a **dual-source pattern**:
- **On-chain**: Rooms are fetched via `fetchOpenPublicRooms()` (Solana RPC)
- **Database enrichment**: Metadata (turn time, mode) is fetched via `game-sessions-list` edge function

Filtering by `mode` must happen at the **database level** since the on-chain room data doesn't include a mode field.

## File Changes

### 1. `supabase/functions/game-session-set-settings/index.ts`

**Change**: Allow `mode="private"` in validation

| Line | Before | After |
|------|--------|-------|
| 30 | `type Mode = "casual" \| "ranked";` | `type Mode = "casual" \| "ranked" \| "private";` |
| 65 | `if (mode !== "casual" && mode !== "ranked")` | `if (mode !== "casual" && mode !== "ranked" && mode !== "private")` |
| 15 | Docstring says `"casual" \| "ranked"` | Update to `"casual" \| "ranked" \| "private"` |

### 2. `supabase/functions/game-sessions-list/index.ts`

**Change**: Exclude private rooms from public room list query

For `type="active"` query, add filter `.neq('mode', 'private')`:

```typescript
// Line 35-40: Update query
const { data, error } = await supabase
  .from('game_sessions')
  .select('room_pda, game_type, status, player1_wallet, player2_wallet, current_turn_wallet, created_at, updated_at, mode, turn_time_seconds')
  .in('status', ['active', 'waiting'])
  .neq('mode', 'private')  // ← ADD THIS LINE
  .order('updated_at', { ascending: false })
  .limit(500)
```

**Note**: The `recoverable_for_wallet` query is NOT modified — users can still see and recover their own private rooms.

### 3. `src/hooks/useSolanaRooms.ts`

**Change**: Filter out private rooms in the client-side enrichment loop

Since on-chain rooms don't have mode info, we need to filter AFTER enrichment:

```typescript
// In fetchRooms() callback, after enrichment (around line 360)
// Build a set of private room PDAs
const privateRoomPdas = new Set<string>();
for (const s of sessions) {
  if (s.mode === 'private') {
    privateRoomPdas.add(s.room_pda);
  }
}

// Filter out private rooms from display
const publicRooms = fetchedRooms.filter(room => !privateRoomPdas.has(room.pda));
```

## Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/game-session-set-settings/index.ts` | Allow `mode="private"` in validation |
| `supabase/functions/game-sessions-list/index.ts` | Exclude `mode='private'` from active sessions query |
| `src/hooks/useSolanaRooms.ts` | Filter private rooms from display list |

## How Private Rooms Are Filtered

Private rooms are filtered from the RoomList by **excluding any room whose database session has `mode='private'`** — this happens in two places:
1. The `game-sessions-list` edge function excludes them from the enrichment response
2. The client-side `useSolanaRooms.fetchRooms()` filters out any room PDA found in the private set

## What's NOT Changing

- On-chain room creation (mode is not stored on-chain)
- Direct room access via `/room/:pda` URL (private rooms remain joinable via link)
- `recoverable_for_wallet` query (users can see their own private rooms)
- CreateRoom.tsx (already passes `mode: gameMode` correctly)
- No database schema changes required

## Testing Verification

After implementation:
1. Create a private room → should NOT appear in RoomList
2. Create a casual/ranked room → should appear in RoomList
3. Access private room via direct link → should work
4. Private room owner sees it in "My Active Games" section
