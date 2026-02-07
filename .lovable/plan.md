

# Fix: Turn Timer and Auto-Forfeit for Private Games

## Investigation Results

### What's Working ✅
Based on the database logs, your most recent test (room `43x66...`) shows:
- Turn time correctly saved as 10 seconds in database
- Two `turn_timeout` events were recorded (one for each player)
- Strikes tracked correctly in `missed_turns` field

### What Needs Fixing

I identified a potential issue where the timer may not be **visually displayed** even though it's **working server-side**. Here's why:

**Problem Location:** The `TurnStatusHeader` component receives `remainingTime` conditionally:

```typescript
// ChessGame.tsx line 1184-1185
remainingTime={isRankedGame ? turnTimer.remainingTime : undefined}
showTimer={isRankedGame && canPlay}
```

If `isRankedGame` is `false` when the component renders (before DB fetch completes), the timer won't display.

**Root Cause:** There's a race condition where:
1. `useRoomMode` starts fetching from DB
2. Before fetch completes, `isRankedGame` defaults to `false`
3. Timer UI doesn't render even though timer logic runs in background

---

## Technical Fix

### 1. Ensure Timer Shows During Loading (All Game Pages)

**Files:** `ChessGame.tsx`, `BackgammonGame.tsx`, `CheckersGame.tsx`, `DominosGame.tsx`, `LudoGame.tsx`

Change the timer visibility logic to show timer whenever `canPlay` is true AND we're in a stake game (private or ranked), using a loading-safe approach:

```typescript
// Before:
showTimer={isRankedGame && canPlay}

// After - show timer for both ranked AND private, with loading state handled:
showTimer={(isRankedGame || roomMode === 'private') && canPlay}
```

Since `isRankedGame` already includes private games (via `useRoomMode`), the real fix is to ensure we don't hide the timer before mode loads.

### 2. Add Loading Fallback for Mode Check

**File:** `src/hooks/useRoomMode.ts`

Return `isRanked: true` as default while loading for stake rooms (safer than defaulting to casual):

```typescript
// Add check for stake from on-chain data as fallback
// If stake > 0 and mode not loaded yet, treat as ranked
```

### 3. Ensure Timer Syncs with DB Value on Load

**File:** `src/hooks/useTurnTimer.ts`

Already has the fix from earlier (lines 53-59) that syncs `remainingTime` when `turnTimeSeconds` changes.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/ChessGame.tsx` | Ensure timer displays while mode loads |
| `src/pages/BackgammonGame.tsx` | Same fix |
| `src/pages/CheckersGame.tsx` | Same fix |
| `src/pages/DominosGame.tsx` | Same fix |
| `src/pages/LudoGame.tsx` | Same fix |
| `src/hooks/useRoomMode.ts` | Default to ranked for rooms with stake while loading |

---

## Auto-Forfeit Clarification

The 3-strike auto-forfeit **is working correctly**. In your test:
- You had 1 missed turn, then played (strike reset)
- Opponent had 1 missed turn, then played (strike reset)

To trigger auto-forfeit, a player must miss **3 consecutive turns** without making any move in between. This is by design to prevent accidental forfeits from brief disconnections.

---

## Testing Verification

After this fix:
1. Create a private room with 10-second timer
2. Verify timer countdown appears on screen
3. Let one player miss 3 turns consecutively (no moves at all)
4. Confirm auto-forfeit triggers and game ends

