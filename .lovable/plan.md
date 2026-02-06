
# Fix: Turn Timer Sync Must Override Active Countdown

## Problem Identified

The timer shows **57 seconds** because:

1. `useRankedReadyGate` initializes `turnTimeSeconds` to `60` (default)
2. `useTurnTimer` initializes `remainingTime` state to `60`  
3. Timer countdown starts immediately when `enabled && isMyTurn` (interval created)
4. DB loads ~3 seconds later with `turn_time_seconds: 10`
5. The sync `useEffect` (line 94-101) checks `!intervalRef.current` — **but interval exists!**
6. Sync is skipped → timer continues counting from ~57

**The condition `!intervalRef.current` was too conservative.** It prevents sync when we actually need it most.

## Solution

Change the sync logic to **always** update `remainingTime` when `turnTimeSeconds` prop changes, but only if the new value is significantly different (not just noise from re-renders).

Two options:

### Option A: Remove the `!intervalRef.current` guard (simple)

```typescript
useEffect(() => {
  if (enabled) {
    setRemainingTime(turnTimeSeconds);
    console.log(`[useTurnTimer] turnTimeSeconds prop changed to ${turnTimeSeconds}s, synced remainingTime`);
  }
}, [turnTimeSeconds, enabled]);
```

Risk: If `turnTimeSeconds` re-renders frequently, timer could reset unexpectedly.

### Option B: Track previous value and only sync on meaningful change (safer)

```typescript
const prevTurnTimeRef = useRef(turnTimeSeconds);

useEffect(() => {
  // Only sync if the turnTimeSeconds actually changed value (not just a re-render)
  if (enabled && prevTurnTimeRef.current !== turnTimeSeconds) {
    console.log(`[useTurnTimer] turnTimeSeconds changed from ${prevTurnTimeRef.current}s to ${turnTimeSeconds}s, syncing remainingTime`);
    setRemainingTime(turnTimeSeconds);
    prevTurnTimeRef.current = turnTimeSeconds;
  }
}, [turnTimeSeconds, enabled]);
```

This ensures sync only happens when DB value actually differs from initial default.

## Recommended: Option B

It's safer because it only resets the timer when the source value changes (60→10), not on every render.

---

## Technical Details

**Files to change:**
- `src/hooks/useTurnTimer.ts` only

**Specific change:**

| Line | Before | After |
|------|--------|-------|
| ~48 | N/A | Add: `const prevTurnTimeRef = useRef(turnTimeSeconds);` |
| 94-101 | `if (enabled && !intervalRef.current)` | `if (enabled && prevTurnTimeRef.current !== turnTimeSeconds)` |

---

## Updated Code

```typescript
// Add after line 48 (after turnTimeSecondsRef)
const prevTurnTimeRef = useRef(turnTimeSeconds);

// Replace lines 94-101
useEffect(() => {
  // Only sync if turnTimeSeconds prop value actually changed (e.g., 60 → 10 from DB)
  if (enabled && prevTurnTimeRef.current !== turnTimeSeconds) {
    console.log(`[useTurnTimer] turnTimeSeconds changed from ${prevTurnTimeRef.current}s to ${turnTimeSeconds}s, syncing remainingTime`);
    setRemainingTime(turnTimeSeconds);
    prevTurnTimeRef.current = turnTimeSeconds;
  }
}, [turnTimeSeconds, enabled]);
```

---

## Expected Behavior After Fix

1. Component mounts with `turnTimeSeconds: 60` (default)
2. Timer initializes `remainingTime: 60`, `prevTurnTimeRef: 60`
3. Timer starts counting: 60 → 59 → 58 → 57...
4. DB loads, `turnTimeSeconds` prop becomes `10`
5. Sync effect runs: `prevTurnTimeRef (60) !== turnTimeSeconds (10)` → TRUE
6. `remainingTime` is set to `10`, `prevTurnTimeRef` updated to `10`
7. Timer now shows `0:10` and counts down correctly

---

## Testing

1. Create ranked Backgammon room with 10s timer
2. Join game
3. Timer should show `0:10` (not 57 or 60)
4. On subsequent turns, timer should reset to 10s
