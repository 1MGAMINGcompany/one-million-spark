
# Fix: Turn Timer Problems -- Stagnant Display and Premature Timeouts

## Problems Found

### 1. CRITICAL: Grace period is INVERTED in the database RPC (causes premature timeouts)

In the `maybe_apply_turn_timeout` RPC function (line 54), the check is:

```sql
IF NOW() < v_deadline - INTERVAL '2 seconds' THEN
  RETURN 'not_expired';
END IF;
```

This means: "skip if current time is before (deadline minus 2 seconds)." So timeout fires 2 seconds **BEFORE** the turn time expires. With a 10-second turn, the timeout triggers at 8 seconds. This is the opposite of the intended 2-second grace.

**Evidence from the database**: The move timestamps show timeouts happening 8-10 seconds apart -- consistent with a 10-second turn minus a 2-second anti-grace.

The correct logic should be:

```sql
IF NOW() < v_deadline + INTERVAL '2 seconds' THEN
  RETURN 'not_expired';
END IF;
```

This gives players their full turn time plus a 2-second grace period.

### 2. Timer display frozen (already planned -- approved in previous plan)

The `useTurnTimer` hook gates the countdown on `isMyTurn`, so it never counts down during the opponent's turn. This was already identified and has an approved fix (remove `!isMyTurn` from the countdown condition).

### 3. Polling restarts every second (already planned -- approved in previous plan)

Including the `turnTimer` object in polling effect dependency arrays causes the interval to clear/restart every second.

## Technical Changes

| Change | Detail |
|--------|--------|
| **Database migration** | Fix `maybe_apply_turn_timeout` RPC: change `v_deadline - INTERVAL '2 seconds'` to `v_deadline + INTERVAL '2 seconds'` |
| **`src/hooks/useTurnTimer.ts`** | Remove `!isMyTurn` from countdown gate so timer counts for both turns |
| **Game pages (5 files)** | Replace `turnTimer` with `turnTimer.resetTimer` in polling effect deps |

### RPC Fix (most critical)

Replace line 54 in `maybe_apply_turn_timeout`:
```sql
-- BEFORE (fires 2s early):
IF NOW() < v_deadline - INTERVAL '2 seconds' THEN

-- AFTER (fires 2s late, giving grace):
IF NOW() < v_deadline + INTERVAL '2 seconds' THEN
```

### Timer display fix (`useTurnTimer.ts`)

Change the countdown gate (around line 107):
```typescript
// BEFORE:
if (!enabled || isPaused || !isMyTurn) {

// AFTER:
if (!enabled || isPaused) {
```

Remove `isMyTurn` from the effect dependency array as well.

### Polling dependency fix (all 5 game pages)

In each game's polling `useEffect`, replace `turnTimer` with `turnTimer.resetTimer` in the dependency array to prevent the interval from being torn down and restarted every second.
