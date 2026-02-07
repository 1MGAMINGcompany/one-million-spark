
# Fix: Hide Private Rooms from Public Room List + Verify ELO Gating

## Problem Analysis

### Issue 1: Private Rooms Visible in Room List

**Current data shows 3 private rooms in database:**
- `FWYAJ24uARjMbN51U4SRHcMfxUxeDUmqYXhLkdmRCFeF` (chess, private, waiting)
- `HicHCChCYzThXytoTAuPzmwG7rY8wYe4AWS3XXGY9E6V` (chess, private, waiting)
- `JDPsAP7RDzTAQozfGSGw6qTfhSrsZRBvQqcWJVuQC7dp` (chess, private, waiting)

**Why they appear in the public list:**
1. `fetchOpenPublicRooms()` fetches ALL open rooms from Solana blockchain
2. The edge function `game-sessions-list` with `type: 'active'` explicitly EXCLUDES private rooms (line 40: `.neq('mode', 'private')`)
3. Frontend tries to filter but `privateRoomPdas` set is always empty (since private rooms were excluded from the query)
4. Result: Private rooms from on-chain slip through unfiltered

### Issue 2: ELO Gating for Private Mode

**Already correctly implemented!** Looking at `record_match_result` function (migration `20260206231844`):

```sql
-- Line 102-104: ELO only runs for mode='ranked'
if p_mode = 'ranked' and array_length(p_players,1) = 2 then
  -- ELO calculation here
end if;
```

The function explicitly accepts 'private' mode (line 38) but only runs ELO logic when `p_mode = 'ranked'`. Private mode skips ELO entirely.

---

## Solution

### Part 1: Add New Query Type for Private Room PDAs

**File: `supabase/functions/game-sessions-list/index.ts`**

Add a new query type `private_room_pdas` that returns PDAs of private rooms for filtering:

```typescript
if (type === 'private_room_pdas') {
  const { data, error } = await supabase
    .from('game_sessions')
    .select('room_pda')
    .eq('mode', 'private')
    .in('status', ['active', 'waiting'])

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  
  console.log('[game-sessions-list] Found', data?.length || 0, 'private room PDAs')
  return new Response(JSON.stringify({ ok: true, rows: data }), { 
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
```

### Part 2: Filter Private Rooms in Frontend

**File: `src/hooks/useSolanaRooms.ts`**

Update `fetchRooms()` to first fetch private PDAs and filter them out BEFORE enrichment:

```typescript
const fetchRooms = useCallback(async () => {
  // ... existing code ...
  
  const fetchedRooms = await fetchOpenPublicRooms(connection);
  
  if (fetchedRooms.length > 0) {
    // STEP 1: Fetch private room PDAs to exclude
    let privatePdas = new Set<string>();
    try {
      const { data: privateResp } = await supabase.functions.invoke("game-sessions-list", {
        body: { type: "private_room_pdas" },
      });
      if (privateResp?.rows) {
        privatePdas = new Set(privateResp.rows.map((r: any) => r.room_pda));
        console.log("[RoomList] Fetched", privatePdas.size, "private PDAs to exclude");
      }
    } catch (err) {
      console.warn("[RoomList] Failed to fetch private PDAs:", err);
    }
    
    // STEP 2: Filter out private rooms BEFORE enrichment
    const publicRooms = fetchedRooms.filter(room => !privatePdas.has(room.pda));
    if (publicRooms.length < fetchedRooms.length) {
      console.log("[RoomList] Filtered out", fetchedRooms.length - publicRooms.length, "private rooms");
    }
    
    // STEP 3: Proceed with enrichment on remaining public rooms
    // ... existing enrichment code, but operate on publicRooms ...
  }
});
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/game-sessions-list/index.ts` | Add `type === 'private_room_pdas'` query handler |
| `src/hooks/useSolanaRooms.ts` | Fetch private PDAs first, filter before enrichment |

---

## ELO Verification (Already Correct)

The `record_match_result` function already gates ELO updates correctly:

```sql
-- Accept 'private' mode (same enforcement as ranked, but no ELO)
if p_mode not in ('casual','ranked','private') then
  raise exception 'bad mode';
end if;

-- ELO only for 'ranked' mode (line 104)
if p_mode = 'ranked' and array_length(p_players,1) = 2 then
  -- ELO calculations...
end if;
```

**Result:**
- `mode = 'ranked'`: ELO updated
- `mode = 'private'`: Player profiles updated (wins/losses), but NO ELO changes
- `mode = 'casual'`: Player profiles updated (wins/losses), but NO ELO changes

---

## Verification Steps

### Test Private Room Hiding
1. Create a private room
2. Open `/room-list` on another device/browser
3. Verify the private room does NOT appear in the list
4. Use the invite link to open `/room/<pda>`
5. Verify the room loads and is joinable

### Test ELO Gating
1. Complete a private match
2. Check the `ratings` table for both players
3. Verify no new rows or rating changes occurred for that game_type
4. Complete a ranked match
5. Verify ELO was updated in the `ratings` table
