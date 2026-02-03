

# Fix: 404 Route on Mobile

## Problem
`RulesGate.tsx` line 117 navigates to `/rooms` which doesn't exist in the app's routing. This causes a 404 error when users try to go back to the room list.

## Solution
Change `navigate("/rooms")` to `navigate("/room-list")` - the correct route.

## File Change

| File | Line | Change |
|------|------|--------|
| `src/components/RulesGate.tsx` | 117 | `/rooms` → `/room-list` |

## Code Change

**Before (line 117):**
```typescript
const handleRejoinRoom = useCallback(() => {
  navigate("/rooms");
}, [navigate]);
```

**After:**
```typescript
const handleRejoinRoom = useCallback(() => {
  navigate("/room-list");
}, [navigate]);
```

## Testing
- On mobile, tap any button that triggers `handleRejoinRoom` (e.g., in AcceptRulesModal)
- Verify navigation goes to room list instead of 404

## Next Steps (after this fix)
1. **P0 - Dice Roll Sync Issue**: The "Opponent sync timed out" at Roll To Start is a real bug that needs investigation (game_sessions row sync, turn_time_seconds not saved, or durable sync subscription closing early)
2. **Spanish translations**: Add missing translation keys minimally for leaking strings

