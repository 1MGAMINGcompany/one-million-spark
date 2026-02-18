

# Free Quick Match PvP (DB-Only, No Solana)

## Overview

Enable free (0 SOL) Quick Match games between real opponents using a database-only matchmaking system. Free rooms use synthetic IDs prefixed with `free-` and bypass all Solana on-chain logic (room creation, escrow, settlement). Paid flow remains completely untouched.

## Architecture

```text
Free Quick Match Flow:
  User selects Free + game type --> clicks Find Match
    |
    v
  Edge function "free-match" (find_or_create)
    |-- Found waiting room? --> Join it, return "joined" + roomPda
    |-- Not found? --> Create new row, return "created" + roomPda
    |
    v
  "created" --> Enter searching phase, poll "free-match/check" every 3s
  "joined"  --> Navigate to /play/<free-xxxxx>
    |
    v
  PlayRoom detects "free-" prefix --> Skip on-chain fetch, load from DB
    |
    v
  Game plays via existing DB sync (useDurableGameSync + Realtime)
    |
    v
  Game over --> Skip on-chain settlement (no funds)
```

## Changes

### 1. New Edge Function: `supabase/functions/free-match/index.ts`

Handles three actions:

**A) `find_or_create`** -- Input: `{ action, gameType, wallet, maxPlayers }`
- Search `game_sessions` for a matching waiting free room: `mode='free'`, `status='waiting'`, matching `game_type` and `max_players`, `player1_wallet != caller`, created in last 15 minutes
- If found: update to set `player2_wallet`, `participants`, `status='active'`, `status_int=2`, `current_turn_wallet=player1_wallet`, `p1_ready=true`, `p2_ready=true`, `start_roll_finalized=true`, `turn_started_at=now()`. Return `{ status: "joined", roomPda }`
- If not found: insert new row with `room_pda='free-' + crypto.randomUUID()`, `mode='free'`, `status='waiting'`, `status_int=1`. Return `{ status: "created", roomPda }`

**B) `check`** -- Input: `{ action, roomPda }`
- Return current `status`, `status_int`, `player2_wallet` for polling

**C) `cancel`** -- Input: `{ action, roomPda, wallet }`
- Only allow if caller is `player1_wallet` and `status='waiting'`
- Set `status='cancelled'`, `status_int=5`
- Return `{ status: "cancelled" }`

Safety: self-match prevention, 15-minute TTL on waiting rooms, idempotent join detection.

### 2. Modify `src/pages/QuickMatch.tsx`

Replace the current AI redirect (lines 180-184) with the DB-only free match flow:

- When `selectedStake === 0`:
  - Call `free-match` with `find_or_create`
  - If `"joined"`: toast, navigate to `/play/<roomPda>`
  - If `"created"`: set `createdRoomPda`, enter searching phase
  - During searching: poll `free-match` with `check` every 3 seconds
  - On opponent detected: navigate to `/play/<roomPda>`
  - Cancel: call `free-match` with `cancel`, then `navigate(-1)`

- Add a `useEffect` for free-room polling during searching phase (separate from the existing on-chain polling)
- Skip all Solana calls (`createRoom`, `record_acceptance`, `getRoomPda`, balance checks)

### 3. Modify `src/pages/PlayRoom.tsx`

Before the `validatePublicKey` / `connection.getAccountInfo` block:

```typescript
const isFreeRoom = roomPdaParam?.startsWith("free-");
```

If free:
- Fetch session via `game-session-get` edge function
- Map DB `game_type` string to `GameType` enum (e.g., "chess" -> GameType.Chess)
- Set `roomData` from DB response (gameType, status, playerCount, maxPlayers)
- Skip all on-chain validation

### 4. Modify `src/pages/RoomRouter.tsx`

Same `free-` prefix detection. For free rooms:
- Fetch from DB via `game-session-get`
- If active, redirect to `/play/<roomPda>`
- If waiting, render Room lobby

### 5. Guard Solana-Only Hooks

**A) `src/hooks/useAutoSettlement.ts`**
- Add early return at the top of the `useEffect` (line ~250): if `roomPda?.startsWith("free-")`, skip settlement entirely
- The `isRanked` guard already helps, but free rooms with mode='free' need explicit handling since `useRoomMode` only returns 'casual' or 'ranked'

**B) `src/hooks/useForfeit.ts`**
- In the `forfeit()` callback: if `roomPda?.startsWith("free-")`, skip the `finalizeGame()` call, just update DB status via edge function and call `forceExit()`
- The `leave()` function already does UI-only cleanup, so it works as-is for free rooms

**C) Game pages (BackgammonGame, ChessGame, DominosGame, CheckersGame, LudoGame)**
- Each game page has a `useEffect` that fetches on-chain room data for player order and entry fees. Add a guard: if `roomPda?.startsWith("free-")`, fetch player data from DB session instead of on-chain, and set `entryFeeSol=0`, `stakeLamports=0`
- This is a small addition (~15 lines) in each game page's room-fetch effect

### 6. Localization (all 10 locale files)

Add keys:

| Key | English |
|-----|---------|
| `quickMatch.freeMatchCreated` | "Free room created! Waiting for opponent..." |
| `quickMatch.freeMatchJoined` | "Opponent found! Starting game..." |
| `quickMatch.freeCancelled` | "Free match cancelled." |

### 7. Config

Add to `supabase/config.toml`:
```toml
[functions.free-match]
verify_jwt = false
```

## What This Does NOT Touch

- Solana program (no changes)
- Paid match flow (stake > 0) -- completely unchanged
- On-chain room creation, escrow, settlement RPCs
- Existing edge functions (game-session-get, submit-move, etc. -- reused as-is)
- Game engines (chess, backgammon, etc.)

## Files Created/Modified

| File | Action |
|------|--------|
| `supabase/functions/free-match/index.ts` | Create -- DB-only matchmaking |
| `src/pages/QuickMatch.tsx` | Modify -- free match DB flow |
| `src/pages/PlayRoom.tsx` | Modify -- free room detection |
| `src/pages/RoomRouter.tsx` | Modify -- free room detection |
| `src/hooks/useAutoSettlement.ts` | Modify -- skip for free rooms |
| `src/hooks/useForfeit.ts` | Modify -- DB-only forfeit for free rooms |
| `src/pages/BackgammonGame.tsx` | Modify -- DB player fetch for free rooms |
| `src/pages/ChessGame.tsx` | Modify -- DB player fetch for free rooms |
| `src/pages/DominosGame.tsx` | Modify -- DB player fetch for free rooms |
| `src/pages/CheckersGame.tsx` | Modify -- DB player fetch for free rooms |
| `src/pages/LudoGame.tsx` | Modify -- DB player fetch for free rooms |
| `src/i18n/locales/*.json` (10 files) | Add 3 new keys |
| `supabase/config.toml` | Add free-match function config |

