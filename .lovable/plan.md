

## Fix Plan: Duplicate Room Prevention + Waiting-Room Auto-Forfeit

### Problem 1: Duplicate Room Creation

**Root cause:** The `createRoom` function checks for active rooms via `fetchUserActiveRoom()`, but this is a network call to Solana RPC that can be bypassed by rapid successive calls. The global `TxLockContext` (which prevents concurrent wallet prompts) is NOT used by `createRoom`.

**Fix:**
- Wrap the entire `createRoom` function body inside `withTxLock()` from `TxLockContext`. This is a one-line change that prevents any second wallet prompt from firing while the first room creation is in flight.
- Add an `inFlightRef` guard (like `joinRoom` already has) as a secondary defense against React StrictMode double-renders.

**Files modified:** `src/hooks/useSolanaRooms.ts`

---

### Problem 2: Waiting-Room Auto-Forfeit Not Triggered

**Root cause:** The `maybe_apply_waiting_timeout` database function exists and works correctly (cancels rooms after 120 seconds if only 1 participant), but NO code ever calls it. The `game-session-get` edge function only calls `maybe_apply_turn_timeout` for active (status_int=2) games, skipping waiting (status_int=1) rooms entirely.

**Fix:**
- In `game-session-get/index.ts`, add a block that calls `maybe_apply_waiting_timeout` when the session has `status_int === 1` (waiting). This mirrors the existing `maybe_apply_turn_timeout` block for active games. When the timeout fires (`applied: true`), the room is marked `cancelled` (status_int=5) in the DB. The on-chain cancel/refund can then be triggered by the waiting player via the existing cancel flow.

**Files modified:** `supabase/functions/game-session-get/index.ts`

---

### Problem 3: Creator Not Notified When Opponent Joins

**Current state:** Push Protocol notifications are fully stubbed (Solana not supported). The only notification is via `GlobalActiveRoomBanner` + `useRoomRealtimeAlert`, which sends a browser notification -- but ONLY if the creator's browser tab is still open and the Notification API is available.

**What already works (no changes needed):**
- `GlobalActiveRoomBanner` detects opponent join via Realtime subscription and shows a toast + browser notification.
- `useRoomRealtimeAlert` monitors `game_sessions.status_int` transitions from 1 to 2.
- Browser notifications (`showBrowserNotification`) fire if permission was granted.

**Gap:** If the creator closed the tab or is in a wallet webview that blocks the Notification API, they get nothing. True push notifications require a service worker + web push subscription, which is a larger feature. For now, the Realtime + browser notification system is the best available.

**No code changes needed** for notifications -- the system works when the tab is open. The real fix is the auto-forfeit (Problem 2) so the waiting player isn't stuck forever.

---

### Summary of Changes

| File | Change |
|---|---|
| `src/hooks/useSolanaRooms.ts` | Wrap `createRoom` in `withTxLock` + add `inFlightRef` guard to prevent double room creation |
| `supabase/functions/game-session-get/index.ts` | Add `maybe_apply_waiting_timeout` call for `status_int === 1` rooms so idle waiting rooms auto-cancel after 2 minutes |

### What This Fixes
- Double room creation is blocked at the client level (wallet prompt mutex).
- Waiting rooms with no opponent auto-cancel after 2 minutes, so joiners aren't stuck waiting forever. The next time either player polls `game-session-get`, the timeout fires and the room is marked cancelled.

### What This Does NOT Change
- No wallet logic changes
- No Solana contract changes
- No game mechanics changes
- No routing changes

