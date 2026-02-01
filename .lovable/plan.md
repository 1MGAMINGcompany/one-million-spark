

# Complete Status Column Alignment: Use `status_int` Everywhere

## Problem Summary

The codebase has **inconsistent status handling** causing potential bugs:

| Issue | Current State | Risk |
|-------|--------------|------|
| **Default mismatch** | `status` defaults to `'active'`, `status_int` defaults to `1` (waiting) | New rows have inconsistent state |
| **Edge functions write text only** | 6 update locations write `status: "finished"` without `status_int: 3` | Integer status never updated on game end |
| **Frontend reads text** | 2 hooks check `session.status === 'finished'` or `=== 'active'` | Logic based on wrong column |

## Clean Rule Going Forward

1. **All logic gates use `status_int` only** (1=waiting, 2=active, 3=finished)
2. **`status` text is for display/backward compatibility only**
3. **Edge functions always write BOTH**: `status_int` + matching `status` string

---

## Complete Inventory of Changes

### Files with `status` writes (Edge Functions) - 6 locations total

| File | Line | Current | Required Change |
|------|------|---------|-----------------|
| `forfeit-game/index.ts` | 769 | `status: "finished"` | Add `status_int: 3` |
| `forfeit-game/index.ts` | 1084 | `status: "finished"` | Add `status_int: 3` |
| `settle-game/index.ts` | 769 | `status: "finished"` | Add `status_int: 3` |
| `settle-game/index.ts` | 1097 | `status: "finished"` | Add `status_int: 3` |
| `settle-draw/index.ts` | 305 | `status: "finished"` | Add `status_int: 3` |
| `settle-draw/index.ts` | 460 | `status: "finished"` | Add `status_int: 3` |
| `recover-funds/index.ts` | 460 | `status: "finished"` | Add `status_int: 3` |
| `game-session-set-settings/index.ts` | 114 | `status: "waiting"` (INSERT) | Add `status_int: 1` |

### Files with `status` reads (Frontend) - 2 files, 5 locations

| File | Lines | Current | Required Change |
|------|-------|---------|-----------------|
| `useStartRoll.ts` | 162, 221, 271, 359 | `session.status === 'finished'` | Use `session.status_int === 3` |
| `useGameSessionPersistence.ts` | 57 | `session.status === 'active'` | Use `session.status_int === 2` |

### Files with `player.status` reads - NO CHANGE NEEDED

These files reference `TurnPlayer.status` which is a **different type** (`"active" | "finished" | "disconnected"`) - NOT the game session status:
- `useTurnNotifications.ts` - uses `player.status` (TurnPlayer interface)
- `TurnStatusHeader.tsx` - uses `player.status` (TurnPlayer interface)
- `GameSyncStatus.tsx` - uses `player.status` (TurnPlayer interface)

---

## Part 1: Database Migration

```sql
-- Align status default to match status_int=1 (waiting)
ALTER TABLE game_sessions 
ALTER COLUMN status SET DEFAULT 'waiting';

-- Fix any existing mismatched rows
UPDATE game_sessions SET status = 'waiting' WHERE status = 'active' AND status_int = 1;
UPDATE game_sessions SET status = 'finished' WHERE status_int = 3 AND status != 'finished';
UPDATE game_sessions SET status = 'active' WHERE status_int = 2 AND status != 'active';
```

---

## Part 2: Create Status Constants

**New file: `src/lib/gameStatus.ts`**

```typescript
export const GAME_STATUS = {
  WAITING: 1,
  ACTIVE: 2,
  FINISHED: 3,
} as const;

export type GameStatusInt = typeof GAME_STATUS[keyof typeof GAME_STATUS];

export function isGameFinished(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.FINISHED;
}

export function isGameActive(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.ACTIVE;
}

export function isGameWaiting(statusInt: number | undefined): boolean {
  return statusInt === GAME_STATUS.WAITING;
}
```

---

## Part 3: Edge Function Updates

### 3.1 `supabase/functions/forfeit-game/index.ts`

**Location 1 (line 769):**
```typescript
.update({
  status: "finished",
  status_int: 3,  // ADD THIS
  game_state: { ... },
```

**Location 2 (line 1084):**
```typescript
.update({
  status: "finished",
  status_int: 3,  // ADD THIS
  game_state: { ... },
```

### 3.2 `supabase/functions/settle-game/index.ts`

**Location 1 (line 769):**
```typescript
.update({
  status: "finished",
  status_int: 3,  // ADD THIS
  game_state: { ... },
```

**Location 2 (line 1097):**
```typescript
.update({
  status: "finished",
  status_int: 3,  // ADD THIS
  game_state: { ... },
```

### 3.3 `supabase/functions/settle-draw/index.ts`

**Location 1 (line 305):**
```typescript
.update({
  status: "finished",
  status_int: 3,  // ADD THIS
  game_state: { ... },
```

**Location 2 (line 460):**
```typescript
.update({ 
  status: "finished",
  status_int: 3,  // ADD THIS
  updated_at: new Date().toISOString() 
})
```

### 3.4 `supabase/functions/recover-funds/index.ts`

**Location (line 460):**
```typescript
.update({ 
  status: "finished",
  status_int: 3,  // ADD THIS
  updated_at: new Date().toISOString() 
})
```

### 3.5 `supabase/functions/game-session-set-settings/index.ts`

**Location (line 108-120) - INSERT:**
```typescript
.insert({
  room_pda: roomPda,
  player1_wallet: creatorWallet,
  player2_wallet: null,
  game_type: gameTypeFromPayload || "unknown",
  game_state: {},
  status: "waiting",
  status_int: 1,  // ADD THIS
  mode: mode,
  turn_time_seconds: turnTimeSeconds,
  max_players: maxPlayers,
  p1_ready: false,
  p2_ready: false,
})
```

---

## Part 4: Frontend Updates

### 4.1 `src/hooks/useStartRoll.ts`

**Add import at top:**
```typescript
import { isGameFinished } from '@/lib/gameStatus';
```

**Line 162:**
```typescript
// Change from:
if (session.status === 'finished') {
// To:
if (isGameFinished(session.status_int)) {
```

**Line 221:**
```typescript
// Change from:
if (session.status === 'finished') return;
// To:
if (isGameFinished(session.status_int)) return;
```

**Line 271:**
```typescript
// Change from:
if (s.status === 'finished') {
// To:
if (isGameFinished(s.status_int)) {
```

**Line 359:**
```typescript
// Change from:
if (session.status === 'finished') {
// To:
if (isGameFinished(session.status_int)) {
```

### 4.2 `src/hooks/useGameSessionPersistence.ts`

**Add import at top:**
```typescript
import { GAME_STATUS } from '@/lib/gameStatus';
```

**Line 57:**
```typescript
// Change from:
if (session && session.status === 'active' && session.game_state && ...)
// To:
if (session && session.status_int === GAME_STATUS.ACTIVE && session.game_state && ...)
```

---

## Part 5: Verification

After implementation, run these checks:

### 5.1 Search Verification (should return 0 results)

```bash
# No status-only writes in edge functions:
grep -r "status: \"finished\"" supabase/functions/ | grep -v "status_int"

# No status text reads in hooks:
grep -r "\.status === 'finished'" src/hooks/
grep -r "\.status === 'active'" src/hooks/ | grep -v "player.status"
```

### 5.2 Database Consistency Check

```sql
-- Verify all rows have matching status/status_int
SELECT COUNT(*) as mismatched FROM game_sessions 
WHERE (status = 'waiting' AND status_int != 1)
   OR (status = 'active' AND status_int != 2)
   OR (status = 'finished' AND status_int != 3);
-- Expected: 0
```

---

## Files to Create/Modify

| Category | File | Change |
|----------|------|--------|
| **Database** | SQL Migration | Align `status` default to `'waiting'`, fix mismatched rows |
| **NEW** | `src/lib/gameStatus.ts` | Status constants + helper functions |
| **Edge Function** | `forfeit-game/index.ts` | Add `status_int: 3` (2 locations) |
| **Edge Function** | `settle-game/index.ts` | Add `status_int: 3` (2 locations) |
| **Edge Function** | `settle-draw/index.ts` | Add `status_int: 3` (2 locations) |
| **Edge Function** | `recover-funds/index.ts` | Add `status_int: 3` (1 location) |
| **Edge Function** | `game-session-set-settings/index.ts` | Add `status_int: 1` (1 location) |
| **Frontend** | `src/hooks/useStartRoll.ts` | Use `status_int` (4 locations) |
| **Frontend** | `src/hooks/useGameSessionPersistence.ts` | Use `status_int` (1 location) |

---

## Technical Notes

### Status Integer Mapping
| Integer | Text | Description |
|---------|------|-------------|
| 1 | waiting | Room created, waiting for players |
| 2 | active | Game in progress |
| 3 | finished | Game complete |

### Why Keep Both Columns?
- Phase 1 (this plan): Align defaults, update all code to use `status_int`, write both columns
- Phase 2 (future): After full verification, drop `status` text column

### GitHub/Lovable Sync
All changes will be committed to the connected GitHub repository automatically when implemented in Lovable.

