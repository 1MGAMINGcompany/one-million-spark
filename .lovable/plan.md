
# Ludo Player Count Selector (2, 3, or 4 Players)

## What We're Adding
When you select Ludo as the game type in the Create Room form (for casual, ranked, or private modes), a new dropdown appears letting you choose 2, 3, or 4 players. This value flows through to the on-chain room creation, the database session, and all downstream systems (turn timer, forfeit, elimination).

## Current State
- The `maxPlayers` state already exists in `CreateRoom.tsx` (line 83), defaulting to `"2"`
- It's already passed to `createRoom()` (line 306) and flows to the on-chain instruction
- **BUT** there is no UI dropdown to change it -- it's always "2"
- The `game-session-set-settings` edge function hardcodes `game_type: "backgammon"` (line 156) and never sets `max_players`

## Changes

### 1. `src/pages/CreateRoom.tsx` -- Add Player Count Dropdown for Ludo

Show a "Number of Players" dropdown **only when Ludo is selected** (`gameType === "5"`). Options: 2, 3, or 4 players.

- Auto-set `maxPlayers` to `"4"` when Ludo is selected (most common)
- Auto-reset to `"2"` when switching away from Ludo
- Pass `gameType` name to the edge function so it persists correctly

### 2. `supabase/functions/game-session-set-settings/index.ts` -- Accept gameType and maxPlayers

Currently this edge function:
- Hardcodes `game_type: "backgammon"` on insert (line 156)
- Never sets `max_players`

We'll update it to:
- Accept `gameType` and `maxPlayers` from the request body
- Validate `gameType` against a whitelist (`chess`, `backgammon`, `checkers`, `dominos`, `ludo`)
- Set `max_players` in both insert and update paths
- Default `max_players` to 2 for non-Ludo games

### 3. Prize Pool Display Fix

The prize pool calculation already uses `parseInt(maxPlayers)` (line 705), so it will automatically show the correct total (e.g., 0.01 SOL x 4 players = 0.04 SOL).

## Files Changed

| File | Change |
|------|--------|
| `src/pages/CreateRoom.tsx` | Add player count dropdown for Ludo, auto-default logic, pass gameType/maxPlayers to edge function |
| `supabase/functions/game-session-set-settings/index.ts` | Accept and persist `gameType` + `maxPlayers` fields |

## Technical Details

### CreateRoom.tsx UI Addition (after the Game Type selector, ~line 585)

```tsx
{/* Player Count - Only for Ludo */}
{gameType === "5" && (
  <div className="space-y-1.5">
    <Label className="text-sm">Number of Players</Label>
    <Select value={maxPlayers} onValueChange={setMaxPlayers}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="2">2 Players</SelectItem>
        <SelectItem value="3">3 Players</SelectItem>
        <SelectItem value="4">4 Players</SelectItem>
      </SelectContent>
    </Select>
    <p className="text-xs text-muted-foreground">
      Ludo supports 2-4 players. 3+ player games use elimination rules.
    </p>
  </div>
)}
```

### Auto-default logic (new useEffect)

```tsx
useEffect(() => {
  if (gameType === "5") {
    // Default Ludo to 4 players (unless rematch overrides)
    if (!isRematch) setMaxPlayers("4");
  } else {
    // All other games are 2 players
    setMaxPlayers("2");
  }
}, [gameType, isRematch]);
```

### Edge Function Update -- game-session-set-settings

Accept two new optional fields in the request body:
- `gameType` (string) -- validated against whitelist
- `maxPlayers` (number) -- validated 2-4

Both the insert and update paths will include these fields:

```typescript
// In the insert path (new session):
game_type: validGameType,  // Instead of hardcoded "backgammon"
max_players: validMaxPlayers,  // Instead of default 2

// In the update path (existing session):
game_type: validGameType,
max_players: validMaxPlayers,
```

### Downstream Compatibility

These systems already handle `max_players > 2` correctly:
- **Turn timer** (`useTurnTimer`): Uses `turn_time_seconds` from DB, player-count agnostic
- **Forfeit** (`forfeit-game`): Checks `max_players` to decide FORFEIT vs ELIMINATE
- **Turn timeout** (`maybe_apply_turn_timeout`): Skips eliminated players, uses `participants` array
- **Settlement** (`settle-game`): Reads `max_players` from on-chain data
- **Room activation** (`maybe_activate_game_session`): Uses `max_players` to determine required count
