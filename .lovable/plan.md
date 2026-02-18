

# Fix: Stale Rooms Showing in Room List

## Problem

The Room List fetches rooms directly from the **Solana blockchain**. When a room is cancelled in the database (after 120s with no opponent), the on-chain account still exists with status "Open". The database cancellation (`maybe_apply_waiting_timeout`) is DB-only -- it does NOT execute the on-chain `cancel_room` transaction because that requires your wallet signature.

There is also **no age filter** in the room list code, so rooms from yesterday (or older) still appear.

## Solution

Add a **15-minute age filter** on the client side when displaying rooms in the Room List, and cross-reference the database's cancelled sessions to exclude stale rooms.

### Changes

### 1. Add age filter to `fetchOpenPublicRooms` enrichment in `src/hooks/useSolanaRooms.tsx`

After the rooms are fetched from chain and enriched with DB data, filter out:
- Rooms whose DB session status is `cancelled` or `finished`
- Rooms older than 15 minutes (using `created_at` from the DB enrichment data)

This requires expanding the `game-sessions-list` edge function response to include `status` and `created_at` (already returned but not fully used in the filter).

In `fetchRooms()` (around line 340-380 in `useSolanaRooms.tsx`):
- Build a Set of room PDAs that are cancelled/finished in the DB
- After enrichment, filter out rooms whose PDA is in the cancelled set
- Add a 15-minute age cutoff: rooms with a `created_at` older than 15 minutes are hidden

### 2. Update the enrichment map in `useSolanaRooms.tsx`

Currently the enrichment map only stores `turnTime` and `mode`. Expand it to also store `status` and `created_at` from the edge function response, so we can filter stale/cancelled rooms.

```text
enrichMap: { turnTime, mode } --> { turnTime, mode, status, createdAt }
```

### 3. Apply the filter after enrichment

```text
// After enrichment loop, before sorting:
const ROOM_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const now = Date.now();

filteredRooms = fetchedRooms.filter(room => {
  const dbData = enrichMap.get(room.pda);
  
  // If DB says cancelled/finished/void, hide it
  if (dbData?.status && ['cancelled', 'finished', 'void'].includes(dbData.status)) {
    return false;
  }
  
  // Age filter: hide rooms older than 15 minutes
  if (dbData?.createdAt) {
    const ageMs = now - new Date(dbData.createdAt).getTime();
    if (ageMs > ROOM_MAX_AGE_MS) return false;
  }
  
  return true;
});
```

### 4. For your 2 existing stale rooms

Once the filter is in place, they will automatically disappear from the list. To also reclaim the SOL locked in those rooms, you can use the "Recover Funds" button on the Recoverable Rooms section (visible when you connect your wallet on the Room List page), which triggers the on-chain `cancel_room` transaction.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useSolanaRooms.tsx` | Expand enrichment map, add age + status filter after enrichment |

## No Backend Changes

The edge function `game-sessions-list` already returns `status` and `created_at` in its response. No DB or edge function changes needed.

