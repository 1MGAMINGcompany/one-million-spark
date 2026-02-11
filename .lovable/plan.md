
# Fix Share Buttons on Win/Lose + Launch Turn Timer Defaults

## Issue 1: Share Buttons Missing on Game End

**Root Cause:** In `GameEndScreen.tsx` line 428, share buttons are gated by `isStaked && roomPda && !isPending`. Casual games never show sharing.

**Fix:** Show share buttons for ALL completed games (staked and casual). For casual games without a `roomPda`, generate a generic share message without the match link.

### Changes in `src/components/GameEndScreen.tsx`:
- Change the share section guard from `isStaked && roomPda && !isPending` to `!isPending` (show for all finished games)
- When `roomPda` exists, include the match card link as today
- When no `roomPda`, share a generic brag message: "I just won [gameType] on 1MGAMING!" without a match link
- Keep the existing WhatsApp, X, Email, Copy Link buttons

---

## Issue 2: Turn Timer Options and Defaults

**Root Cause:** In `CreateRoom.tsx`:
- Line 83: default is `"10"` for all games
- Lines 614-623: options are 5s, 10s, 15s, Unlimited -- missing 30s and 60s entirely

**Fix:** Update options and defaults per spec.

### Changes in `src/pages/CreateRoom.tsx`:

**A) Default turn time based on game type (line 83 + new effect):**
- Chess (1), Checkers (4), Dominos (2), Ludo (5): default = `"30"`
- Backgammon (3): default = `"60"`
- When game type changes, auto-update default

**B) Turn time dropdown options (lines 614-623):**
Remove 5s and 15s. New options for all games:
- `10` -- "10s (Blitz)"
- `30` -- "30s (Standard)"  
- `60` -- "60s (Relaxed)"
- `0` -- "Unlimited"

For Backgammon and Ludo, exclude 10s Blitz (complex multi-action turns), showing only 30s, 60s, Unlimited.

**C) Auto-switch effect (lines 116-120):**
Update the existing effect that handles game type changes:
- If backgammon selected and current timer is 10, switch to 60
- If non-backgammon selected, switch to 30 (if currently at 60 or not set)

**D) Persistence:** No changes needed -- the existing `turnTimeSeconds` flow to `game-session-set-settings` edge function already handles any numeric value correctly.

---

## Technical Details

### Files Modified:
1. **`src/components/GameEndScreen.tsx`** -- Expand share section visibility
2. **`src/pages/CreateRoom.tsx`** -- Update timer defaults, options, and auto-switch logic

### No Backend Changes Required
- The edge function `game-session-set-settings` already accepts any numeric `turnTimeSeconds`
- The `useTurnTimer` hook already works with any value
- Database `turn_time_seconds` column has no constraints on specific values

### Default Summary Table

```text
Game Type      Default    Available Options
-----------    -------    ---------------------------
Chess          30s        10s (Blitz), 30s, 60s, Unlimited
Checkers       30s        10s (Blitz), 30s, 60s, Unlimited
Dominos        30s        10s (Blitz), 30s, 60s, Unlimited
Ludo           30s        30s, 60s, Unlimited
Backgammon     60s        30s, 60s, Unlimited
```
