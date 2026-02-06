
# Remove 10-Second Turn Timer Option for Backgammon

## Overview
Remove the 10-second turn timer option from Backgammon to give players more time for the complex multi-step turns (rolling dice + moving multiple pieces).

## File Changes

### `src/pages/CreateRoom.tsx`

**Change 1: Hide 10-second option for Backgammon (line 619)**

Currently the 10-second option is shown for all games. We need to exclude it for Backgammon (gameType "3"):

```typescript
// Before:
<SelectItem value="10">{t("createRoom.seconds", { count: 10 })}</SelectItem>

// After:
{gameType !== "3" && (
  <SelectItem value="10">{t("createRoom.seconds", { count: 10 })}</SelectItem>
)}
```

**Change 2: Update default time fallback for Backgammon (lines 116-119)**

When Backgammon is selected and the current timer is 5s or 10s, default to 15s:

```typescript
// Before:
useEffect(() => {
  if ((gameType === "3" || gameType === "5") && turnTime === "5") {
    setTurnTime("10");
  }
}, [gameType, turnTime]);

// After:
useEffect(() => {
  // 5s excluded for Backgammon (3) and Ludo (5)
  if ((gameType === "3" || gameType === "5") && turnTime === "5") {
    setTurnTime("15");
  }
  // 10s also excluded for Backgammon (3) - too complex for fast turns
  if (gameType === "3" && turnTime === "10") {
    setTurnTime("15");
  }
}, [gameType, turnTime]);
```

## Turn Timer Options After Change

| Game | 5s | 10s | 15s | Unlimited |
|------|-----|------|------|-----------|
| Chess | ✅ | ✅ | ✅ | ✅ |
| Checkers | ✅ | ✅ | ✅ | ✅ |
| Dominos | ✅ | ✅ | ✅ | ✅ |
| Ludo | ❌ | ✅ | ✅ | ✅ |
| **Backgammon** | ❌ | ❌ | ✅ | ✅ |

## Rationale
Backgammon requires multiple sub-actions per turn (roll dice → evaluate moves → execute 2-4 piece moves). Even 10 seconds is tight for thoughtful play, especially with doubles where 4 moves are required.

## Technical Notes
- No database changes needed
- No edge function changes needed
- Existing games with 10-second timers will continue to work (this only affects new room creation)
