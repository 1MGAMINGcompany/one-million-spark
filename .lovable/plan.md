

# Multiplayer Ludo: 2-4 Player Support with Turn Skip and Multi-Forfeit Logic

## Overview

This plan implements full multiplayer Ludo support for 2, 3, or 4 players with special handling for:
1. Player count selection during room creation
2. Turn skipping when players miss their turn
3. Multi-player forfeit scenarios (game continues with remaining players)
4. Winner payout and creator rent refund

---

## Current State Analysis

### What Already Works
- On-chain program supports 2, 3, or 4 players via `max_players` field
- Ludo engine (`src/lib/ludo/engine.ts`) already uses `players.length` for turn rotation
- 4 player colors defined: gold, ruby, sapphire, emerald
- Turn timer and missed turn tracking exists via `useTurnTimer` and `missedTurns.ts`
- Basic player elimination tracking via `eliminatedPlayers` Set in `useLudoEngine`

### What Needs Implementation
1. **CreateRoom.tsx**: Add player count dropdown when Ludo is selected
2. **Room.tsx**: Display player count and wait for correct number of players
3. **LudoGame.tsx**: Handle 2-4 player dynamics, eliminated player skip, multi-forfeit
4. **Database**: Store and track player count, eliminated players, partial forfeits
5. **Settlement**: Handle winner payout with multiple forfeit scenarios

---

## Technical Implementation

### Part 1: Room Creation with Player Count Selection

**File: `src/pages/CreateRoom.tsx`**

Add a conditional dropdown that appears only when Ludo (GameType 5) is selected:

```typescript
// State for Ludo player count
const [ludoPlayerCount, setLudoPlayerCount] = useState<string>("4");

// Compute effective max players
const effectiveMaxPlayers = gameType === "5" ? ludoPlayerCount : "2";
```

UI Changes:
- When `gameType === "5"` (Ludo), show a new Select dropdown:
  - Label: "Number of Players"
  - Options: 2 Players, 3 Players, 4 Players
  - Default: 4 Players
- Pass `effectiveMaxPlayers` to `createRoom()` instead of hardcoded "2"

### Part 2: Room Lobby Waiting for N Players

**File: `src/pages/Room.tsx`**

Current behavior waits for 2 players. Need to:
- Fetch `maxPlayers` from on-chain room data
- Display "Waiting for X/Y players" instead of hardcoded 2
- Only navigate to game when `playerCount === maxPlayers`

Changes:
- Add `maxPlayers` state from `parseRoomAccount`
- Update UI to show `{playerCount}/{maxPlayers} players`
- Gate join logic on `playerCount < maxPlayers`
- Auto-start when `playerCount === maxPlayers`

### Part 3: LudoGame.tsx Multi-Player Logic

**File: `src/pages/LudoGame.tsx`**

Major changes needed:

#### A. Player Initialization from On-Chain Data
Currently initializes 4 AI players and replaces with real wallets. Need to:
- Read `maxPlayers` from on-chain room
- Initialize only that many players
- Mark human players based on `players[]` array from chain

```typescript
// Instead of always 4 players
const playerCount = roomData.maxPlayers; // 2, 3, or 4
const onChainPlayers = roomData.players.map(p => p.toBase58());

// Create players array based on actual count
const gamePlayers = PLAYER_COLORS.slice(0, playerCount).map((color, idx) => ({
  color,
  wallet: onChainPlayers[idx] || null,
  isAI: false, // All are real players in multiplayer
  eliminated: false,
}));
```

#### B. Turn Advancement Skips Eliminated Players
When advancing turns, skip players who have been eliminated:

```typescript
function getNextActivePlayerIndex(current: number, players: Player[], eliminated: Set<number>): number {
  let next = (current + 1) % players.length;
  let attempts = 0;
  
  while (eliminated.has(next) && attempts < players.length) {
    next = (next + 1) % players.length;
    attempts++;
  }
  
  return next;
}
```

#### C. Missed Turn Handling (Per Original Specification)
- 1st miss: Skip to next player, show "1/3 missed turns"
- 2nd miss: Skip to next player, show "2/3 missed turns"
- 3rd miss: **Forfeit** - player is kicked out, game continues

On 3rd miss:
```typescript
// Mark player as eliminated
setEliminatedPlayers(prev => new Set([...prev, playerIndex]));

// Broadcast elimination to other players
sendPlayerEliminated(playerIndex);

// Check if only 1 player remains
const remainingPlayers = players.filter((_, idx) => !eliminatedPlayers.has(idx));
if (remainingPlayers.length === 1) {
  // Game over - this player wins
  declareWinner(remainingPlayers[0].color);
}
```

#### D. Winner Determination Logic
The last remaining player wins. Handle cases:
- 2 players: When 1 forfeits, other wins immediately
- 3 players: When 2 forfeit, remaining 1 wins
- 4 players: When 3 forfeit, remaining 1 wins
- Normal win: First player to get all 4 tokens home wins

### Part 4: Database Schema Updates

**New Fields in `game_sessions`**

Need to track:
- `max_players`: Number of players expected (2, 3, or 4)
- `eliminated_players`: Array of wallet addresses who forfeited
- `active_players`: Count of still-active players

Edge Function Updates:
- `game-session-set-settings`: Store `max_players` from creation
- `game-session-get`: Return `max_players` and `eliminated_players`
- `settle-game`: Handle partial forfeits (only deduct from pot, don't end game)

### Part 5: Partial Forfeit Settlement Logic

**File: `supabase/functions/settle-game/index.ts`**

Current logic settles entire pot to winner. For Ludo multi-player:

When a player forfeits mid-game (before winner determined):
1. Their stake remains in vault (no immediate payout)
2. Mark them as eliminated in `game_sessions`
3. Game continues with remaining players

When final winner is determined:
1. Calculate total pot: `stake × initial_player_count`
2. Deduct 5% platform fee
3. Pay 95% to winner
4. Refund room rent to creator (always)

```typescript
// Ludo settlement with forfeits
if (gameType === 5 && eliminatedPlayers.length > 0) {
  // Pot = all stakes including forfeited players
  const totalPot = stakeLamports * initialPlayerCount;
  const platformFee = totalPot * 0.05;
  const winnerPayout = totalPot - platformFee;
  
  // Creator always gets rent refund (room account closure)
}
```

### Part 6: WebRTC Message Types for Ludo

**File: `src/hooks/useWebRTCSync.ts`**

Add new message types for Ludo multiplayer:

```typescript
type LudoMessage = 
  | { type: 'player_eliminated'; playerIndex: number; wallet: string }
  | { type: 'turn_skip'; playerIndex: number; missedCount: number }
  | { type: 'ludo_move'; move: LudoMove }
  | { type: 'game_over'; winnerWallet: string; winnerColor: string }
```

Handler updates in `LudoGame.tsx`:
- On `player_eliminated`: Add to local eliminated set, skip their turns
- On `turn_skip`: Update local turn state
- On `game_over`: Show winner screen, trigger settlement

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CreateRoom.tsx` | Add Ludo player count dropdown |
| `src/pages/Room.tsx` | Wait for N players, show X/Y progress |
| `src/pages/LudoGame.tsx` | Multi-player initialization, elimination logic, winner determination |
| `src/hooks/useLudoEngine.ts` | Add elimination tracking, skip eliminated in advanceTurn |
| `src/lib/ludo/engine.ts` | Update advanceTurn to accept eliminated set |
| `src/lib/missedTurns.ts` | No changes needed (already tracks per-wallet) |
| `supabase/functions/settle-game/index.ts` | Handle Ludo multi-forfeit settlement |
| `supabase/functions/game-session-set-settings/index.ts` | Store max_players |
| `supabase/functions/game-session-get/index.ts` | Return max_players and eliminated_players |

---

## Database Migration

Add to `game_sessions` table:
```sql
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS eliminated_players TEXT[] DEFAULT '{}';
```

---

## Expected Behavior Flow

### 4-Player Ludo Game

1. **Room Creation**: Creator selects Ludo → dropdown appears → selects "4 Players" → creates room
2. **Waiting**: Room lobby shows "1/4 players" → players join one by one
3. **Game Start**: When 4 players joined, all accept rules, start roll determines order
4. **Normal Play**: Turn rotates Gold → Ruby → Sapphire → Emerald → Gold...
5. **Turn Timeout**: If player misses turn timer:
   - 1st miss: Toast "1/3 missed", skip to next
   - 2nd miss: Toast "2/3 missed", skip to next
   - 3rd miss: Toast "Eliminated!", player kicked, game continues
6. **Mid-Game Forfeit**: If Emerald forfeits after 3 misses:
   - Turn order becomes Gold → Ruby → Sapphire → Gold...
   - Emerald's stake stays in pot
7. **Winner**: First player to get all 4 tokens home OR last remaining player
8. **Settlement**: Winner gets (4 × stake - 5% fee), creator gets rent refund

### Edge Cases Handled
- 2 players left, one forfeits → other wins immediately
- All but one player forfeits → remaining player wins
- Player disconnects → timeout handler triggers skips/forfeit
- Creator forfeits → rent still refunded to creator, game continues if 2+ remain

---

## Testing Checklist

1. Create Ludo room with 2, 3, and 4 players (verify on-chain)
2. Verify room lobby waits for correct player count
3. Test turn skip on 1st and 2nd timeout
4. Test auto-forfeit on 3rd timeout
5. Verify eliminated player is skipped in turn rotation
6. Test winner when only 1 player remains
7. Test normal win (all 4 tokens home)
8. Verify settlement pays correct amounts
9. Verify creator gets rent refund after forfeit
10. Test WebRTC sync of elimination across devices

