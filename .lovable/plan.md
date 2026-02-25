
# Fix: Wrong SOL Amount on Share Card + Settlement Error Display

## Summary

Three issues found from the test. The board stability is confirmed working.

## Issue 1: Share Card Shows "807,039,453.67 SOL" (Critical)

### Root Cause

The `parseRoomData` function in `GameEndScreen.tsx` has **incorrect byte offsets** for reading the on-chain Room account.

The actual Room struct from the IDL:
```text
Offset  Field
------  -----
0       discriminator (8 bytes)
8       room_id (u64, 8 bytes)
16      creator (pubkey, 32 bytes)
48      game_type (u8, 1 byte)
49      max_players (u8, 1 byte)
50      player_count (u8, 1 byte)
51      status (u8, 1 byte)
52      stake_lamports (u64, 8 bytes)  <-- CORRECT offset
60      winner (pubkey, 32 bytes)
92      players (4 x pubkey, 128 bytes)
```

The current code assumes:
```text
ENTRY_FEE_OFFSET = 8 + 32 + 32 = 72  <-- WRONG (20 bytes too late)
STATUS_OFFSET = 80                     <-- WRONG
WINNER_OFFSET = 81                     <-- WRONG
```

Because the code reads at offset 72, it interprets random bytes from the middle of the `winner` pubkey as the `stake_lamports` value, producing a garbage number like 807,039,453,670,000,000 lamports. When divided by LAMPORTS_PER_SOL, that becomes 807,039,453.67 -- exactly what the user saw.

### Fix

Update `parseRoomData` in `src/components/GameEndScreen.tsx` to use the correct offsets:

```text
ROOM_ID_OFFSET   = 8
CREATOR_OFFSET   = 16
GAME_TYPE_OFFSET = 48
MAX_PLAYERS_OFF  = 49
PLAYER_COUNT_OFF = 50
STATUS_OFFSET    = 51
STAKE_OFFSET     = 52
WINNER_OFFSET    = 60
```

Also extract `max_players` from the account instead of hardcoding to 2, and `player_count` for additional safety.

## Issue 2: "Settlement Issue" Error Displayed Despite Successful Settlement

### Root Cause

When the user forfeits from desktop, `forfeit-game` calls `settle-game` server-side. Simultaneously, the mobile client's `useAutoSettlement` hook detects the game-over and also calls `settle-game`. This creates a race condition:

1. First call: `submit_result` succeeds, vault drained, `close_room` succeeds
2. Second call: `submit_result` fails with "AccountNotInitialized" because vault is already empty

The second call's error is displayed to the user even though settlement was fully completed.

### Fix

In `settle-game/index.ts`, catch the specific `AccountNotInitialized` (error 0xbc4 / 3012) error during `submit_result` and check if the room is already in Finished status (status=3). If so, treat it as an idempotent success rather than an error.

Add error handling around the `submit_result` transaction at line 883-896. If the error contains "AccountNotInitialized" or "0xbc4", re-fetch the room account. If the room is now status=3 (Finished), return success with `alreadySettled: true`.

## Issue 3: Board Stability

Confirmed working -- the mobile board no longer shifts between turns.

---

## Technical Details

### File: `src/components/GameEndScreen.tsx` (lines 122-148)

Replace the `parseRoomData` function with correct offsets from the IDL:

```text
function parseRoomData(data: Buffer): RoomPayoutInfo {
  try {
    // Room account layout from IDL:
    // 8 discriminator + 8 room_id + 32 creator + 1 game_type + 1 max_players + 1 player_count + 1 status + 8 stake_lamports + 32 winner + 128 players
    const STATUS_OFFSET = 8 + 8 + 32 + 1 + 1 + 1; // = 51
    const STAKE_OFFSET = STATUS_OFFSET + 1;          // = 52
    const WINNER_OFFSET = STAKE_OFFSET + 8;           // = 60
    const MAX_PLAYERS_OFFSET = 8 + 8 + 32 + 1;       // = 49
    const PLAYER_COUNT_OFFSET = MAX_PLAYERS_OFFSET + 1; // = 50

    const status = data[STATUS_OFFSET];
    const stakeLamports = Number(data.readBigUInt64LE(STAKE_OFFSET));
    const maxPlayers = data[MAX_PLAYERS_OFFSET] || 2;
    const winnerBytes = data.slice(WINNER_OFFSET, WINNER_OFFSET + 32);
    const winnerPubkey = new PublicKey(winnerBytes).toBase58();

    const isFinished = status === 2 || status === 3;
    const winnerSet = winnerPubkey !== DEFAULT_PUBKEY;

    return {
      isSettled: isFinished || winnerSet,
      onChainWinner: winnerSet ? winnerPubkey : null,
      stakeLamports,
      maxPlayers,
    };
  } catch {
    return { isSettled: false, onChainWinner: null, stakeLamports: 0, maxPlayers: 2 };
  }
}
```

### File: `supabase/functions/settle-game/index.ts` (lines 883-896)

Wrap the `sendRawTransaction` call in a try-catch that detects the "AccountNotInitialized" vault error. If caught, re-fetch the room account to check if it's already settled (status 3). If yes, proceed to DB recording and return success:

```text
try {
  signature = await connection.sendRawTransaction(tx.serialize(), { ... });
  // ... confirm ...
} catch (txErr) {
  const errMsg = String(txErr.message || txErr);
  // If vault is already drained (another settle-game won the race), check if room is now Finished
  if (errMsg.includes("AccountNotInitialized") || errMsg.includes("0xbc4")) {
    const roomInfoRetry = await connection.getAccountInfo(roomPdaKey, "confirmed");
    if (roomInfoRetry?.data) {
      const retryData = parseRoomAccount(roomInfoRetry.data);
      if (retryData.status === 3) {
        // Room was settled by a concurrent call -- treat as idempotent success
        return json200({ success: true, alreadySettled: true, ... });
      }
    }
  }
  throw txErr; // re-throw if not the race condition case
}
```

### What is NOT touched
- No database migrations
- No game logic or move validation changes
- No board layout changes
- No changes to other game types
