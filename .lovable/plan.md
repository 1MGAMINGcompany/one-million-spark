
## Add Turn Time Display to Room List

### Problem
The Room List page doesn't show turn times for rooms because:
1. Turn time is stored in the database (`game_sessions.turn_time_seconds`), not on the Solana blockchain
2. The current code fetches rooms only from Solana, where `turnTimeSec` defaults to `0`
3. The UI only shows turn time when `turnTimeSec > 0`, so nothing appears

### Solution
Enrich room data from Solana with turn time from the database after fetching.

---

### Implementation

#### File: `src/hooks/useSolanaRooms.ts`

Update the `fetchRooms` function to:
1. Fetch rooms from Solana (existing behavior)
2. Query `game_sessions` table for turn times of fetched rooms
3. Merge the turn time data into the room objects

```text
Current flow:
  Solana -> rooms (turnTimeSec = 0) -> display

New flow:
  Solana -> rooms (turnTimeSec = 0)
                          |
                          v
            game_sessions (turn_time_seconds)
                          |
                          v
        Enriched rooms (turnTimeSec = actual value) -> display
```

**Changes to `fetchRooms`:**

```typescript
const fetchRooms = useCallback(async () => {
  setLoading(true);
  setError(null);
  
  try {
    // Step 1: Fetch rooms from Solana
    const fetchedRooms = await fetchOpenPublicRooms(connection);
    
    // Step 2: Enrich with turn time from database
    if (fetchedRooms.length > 0) {
      const roomPdas = fetchedRooms.map(r => r.pda);
      const { data: sessions } = await supabase
        .from("game_sessions")
        .select("room_pda, turn_time_seconds")
        .in("room_pda", roomPdas);
      
      if (sessions && sessions.length > 0) {
        // Create lookup map
        const turnTimeMap = new Map<string, number>();
        for (const s of sessions) {
          if (s.turn_time_seconds != null) {
            turnTimeMap.set(s.room_pda, s.turn_time_seconds);
          }
        }
        
        // Enrich rooms
        for (const room of fetchedRooms) {
          const dbTurnTime = turnTimeMap.get(room.pda);
          if (dbTurnTime !== undefined && dbTurnTime > 0) {
            room.turnTimeSec = dbTurnTime;
          }
        }
      }
    }
    
    setRooms(fetchedRooms);
  } catch (err) {
    setError("Failed to fetch rooms");
  } finally {
    setLoading(false);
  }
}, [connection]);
```

---

### Expected Result

After implementation, the Room List will show:

| Before | After |
|--------|-------|
| Backgammon #123 - 0.0056 SOL - 1/2 | Backgammon #123 - 0.0056 SOL - 1/2 - **10s** |

The amber clock icon with turn time will appear for all ranked rooms that have a turn timer configured.

---

### Technical Notes

- No database migration needed - `game_sessions.turn_time_seconds` column already exists
- The enrichment query is batched (single query for all room PDAs) for efficiency
- Only rooms with `turn_time_seconds > 0` will show the timer badge
- Casual rooms (turn_time_seconds = 0 or 60) may show differently based on configuration
