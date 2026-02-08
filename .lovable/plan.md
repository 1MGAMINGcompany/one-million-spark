# Dead Room Auto-Resolution (Safe Version) ✅ IMPLEMENTED

## Overview

Server-side auto-cancellation for rooms stuck in WAITING state (status_int = 1) with only 1 participant for > 120 seconds. The DB marks the room as CANCELLED (status_int = 5), and the creator can claim their refund by signing a single transaction.

## Implementation Status: COMPLETE

### Changes Made:

1. **Database Migration** ✅
   - Added `waiting_started_at` column to `game_sessions`
   - Created `maybe_apply_waiting_timeout(p_room_pda)` RPC
   - Updated `record_acceptance` to set/clear `waiting_started_at`

2. **Edge Function** ✅
   - Updated `game-session-get` to call timeout RPC for WAITING rooms
   - Re-fetches session after cancellation

3. **Room.tsx UI** ✅
   - Added `dbStatusInt` state to track DB status
   - Shows "Opponent didn't show" panel with RecoverFundsButton when cancelled

## Architecture

```text
Creator accepts → waiting_started_at = now() → polling via game-session-get
                                                      ↓
                                         maybe_apply_waiting_timeout()
                                                      ↓
                              If >120s: status_int = 5, status = 'cancelled'
                                                      ↓
                                      Room.tsx shows refund button
                                                      ↓
                                Creator signs → funds returned
```

## Security

- **No verifier signing**: Creator must sign their own cancel transaction
- **Idempotent**: Multiple calls to RPC are safe
- **Atomic**: Uses `FOR UPDATE` lock
- **DB-only**: Does NOT attempt on-chain cancel
