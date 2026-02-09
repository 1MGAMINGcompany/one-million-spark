

# Fix: Pass actual game_type when creating rooms

## Root Cause

The `game-session-set-settings` edge function hardcodes `game_type: "backgammon"` (line 156) when inserting a new session. The comment says "will be updated when game starts" but nothing ever does. This means:

- Chess rooms get `game_type: backgammon`
- The new auto-flip logic (which checks for `chess`/`checkers`/`dominos`) never fires
- Turns only flip via `maybe_apply_turn_timeout`, which wastes strikes and creates delays

## Why It "Worked Before"

The previous system didn't use `game_type` for turn management. All turn flipping relied on explicit `turn_end` moves or timeout polling. The new migration added game-type-aware auto-flip but the wrong game_type means it's dead code for non-backgammon rooms.

## Fix (2 changes)

### 1. Frontend: Send `gameType` in the settings request

In `src/pages/CreateRoom.tsx`, add the `gameType` field to the `game-session-set-settings` invocation body. The numeric game type ID (e.g., `"1"` for chess) needs to be mapped to the string name the RPC expects.

Map: `1 = chess`, `2 = dominos`, `3 = backgammon`, `4 = checkers`, `5 = ludo`

### 2. Edge Function: Accept and use `gameType` parameter

In `supabase/functions/game-session-set-settings/index.ts`:

- Accept optional `gameType` field from the request body
- Use it in the INSERT (line 156) instead of hardcoded `"backgammon"`
- Also apply it during UPDATE (line 132) so existing sessions with wrong game_type get corrected
- Default to `"unknown"` if not provided (backward compat)

### 3. Fix existing broken sessions (optional cleanup)

Any recently created sessions may have the wrong `game_type`. The fix going forward prevents new ones, but old rooms stuck as "backgammon" when they're actually chess won't retroactively change. This is acceptable since those games are already finished.

## Technical Details

| File | Change |
|------|--------|
| `src/pages/CreateRoom.tsx` | Add `gameType` name string to the `game-session-set-settings` invocation body |
| `supabase/functions/game-session-set-settings/index.ts` | Accept `gameType` param, use it in INSERT and UPDATE instead of hardcoded `"backgammon"` |

### CreateRoom.tsx change

Find the call to `game-session-set-settings` and add a `gameType` field derived from the numeric game type:

```typescript
const GAME_TYPE_NAMES: Record<string, string> = {
  "1": "chess",
  "2": "dominos", 
  "3": "backgammon",
  "4": "checkers",
  "5": "ludo",
};

// In the invoke call:
body: {
  roomPda,
  turnTimeSeconds,
  mode,
  creatorWallet,
  gameType: GAME_TYPE_NAMES[gameType] || "unknown",
}
```

### Edge Function change

```typescript
// Accept from payload
const gameType = payload?.gameType || "unknown";

// Use in INSERT (replacing hardcoded "backgammon")
game_type: gameType,

// Also set during UPDATE
.update({
  turn_time_seconds: turnTimeSeconds,
  mode,
  game_type: gameType,  // Fix stale game_type
})
```

## Verification

After applying:
1. Create a ranked chess room with 10s timer
2. Make a move -- confirm `current_turn_wallet` flips immediately (no timeout needed)
3. Confirm `game_type` in DB is `chess` (not `backgammon`)
4. Test backgammon still works correctly with multi-move turns

