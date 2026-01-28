

# Fix Turn Timer Running on Both Devices + Mobile Share Links

## Problem 1: Turn Timer Freeze - CRITICAL BUG CONFIRMED

### Evidence from Database
The latest chess game (`9o6wsiQ...`) shows both players submitting timeout moves:

| Turn | Wallet Submitting | timedOutWallet | Action |
|------|-------------------|----------------|--------|
| 1 | Fbk1... (OPPONENT) | AtLG... | turn_timeout |
| 2 | Fbk1... (OPPONENT) | AtLG... | turn_timeout |
| 3 | AtLG... (PLAYER) | AtLG... | turn_timeout |

**Both devices fired timeout logic.** The opponent (Fbk1) is submitting timeouts for AtLG's turn, which is incorrect.

### Root Cause Analysis

**Issue 1: Mismatch between `enabled` and `isMyTurn` in game files**

In `BackgammonGame.tsx` (line 1106-1107) and `DominosGame.tsx` (line 688-689):
```typescript
useTurnTimer({
  enabled: shouldShowTimer && isActuallyMyTurn,  // ← uses isActuallyMyTurn
  isMyTurn: effectiveIsMyTurn,                   // ← uses DIFFERENT variable!
})
```

When these variables differ, the hook's internal logic gets confused.

**Issue 2: The `useTurnTimer` hook resets on ANY turn change**

Line 77-81 of `useTurnTimer.ts`:
```typescript
useEffect(() => {
  if (enabled) {
    resetTimer();  // ← Resets even if NOT my turn!
  }
}, [isMyTurn, enabled, resetTimer]);
```

The reset fires when `isMyTurn` changes AND `enabled` is true. But `enabled` can be true when `isMyTurn` is false (if the mismatch exists).

**Issue 3: Missing debounce protection in opponent timeout detection**

The opponent timeout detection hook can fire even when the database already shows a timeout was submitted, causing duplicate moves.

### Fix Strategy

1. **Ensure `enabled` and `isMyTurn` use the EXACT SAME variable** in all 5 game files
2. **Fix the hook's reset logic** - only reset when it becomes MY turn
3. **ChessGame.tsx already uses `isActuallyMyTurn` for both** - correct pattern

### Files to Modify

| File | Line | Current | Fixed |
|------|------|---------|-------|
| `src/pages/BackgammonGame.tsx` | ~1107 | `isMyTurn: effectiveIsMyTurn` | `isMyTurn: isActuallyMyTurn` |
| `src/pages/DominosGame.tsx` | ~689 | `isMyTurn: effectiveIsMyTurn` | `isMyTurn: isActuallyMyTurn` |
| `src/hooks/useTurnTimer.ts` | 77-81 | Reset when `enabled` | Reset only when `enabled && isMyTurn` |

### Code Changes

**useTurnTimer.ts (line 77-81):**
```typescript
// BEFORE:
useEffect(() => {
  if (enabled) {
    resetTimer();
  }
}, [isMyTurn, enabled, resetTimer]);

// AFTER:
useEffect(() => {
  // Only reset when it becomes MY turn (not opponent's)
  if (enabled && isMyTurn) {
    resetTimer();
  }
}, [isMyTurn, enabled, resetTimer]);
```

**BackgammonGame.tsx (line ~1107):**
```typescript
// BEFORE:
isMyTurn: effectiveIsMyTurn,

// AFTER:
isMyTurn: isActuallyMyTurn,
```

**DominosGame.tsx (line ~689):**
```typescript
// BEFORE:
isMyTurn: effectiveIsMyTurn,

// AFTER:
isMyTurn: isActuallyMyTurn,
```

---

## Problem 2: Mobile Share Links Fail

### Root Cause

The `shareInvite` function in `src/lib/invite.ts` (lines 97-107) passes BOTH:
1. A `text` parameter containing the full invite message WITH embedded URL (line 61)
2. A `url` parameter with the canonical link

The embedded URL in `text` includes the preview domain:
```
👉 https://id-preview--xxx.lovable.app/room/ABC...
```

Mobile share targets (WhatsApp, SMS) often prioritize the `text` body and use the embedded preview URL instead of the canonical `url` parameter.

### Fix Strategy

Remove the embedded URL from the `text` when using native share. The canonical link should ONLY be passed via the `url` parameter.

### Code Changes

**invite.ts - buildInviteMessage function:**
Add a parameter to control whether to include the URL:
```typescript
export function buildInviteMessage(info: RoomInviteInfo, includeLink: boolean = true): string {
  // ... existing lines ...
  
  if (includeLink) {
    lines.push('📱 On mobile? Open this link inside your wallet app!');
    lines.push(`👉 ${buildInviteLink({ roomId: info.roomPda })}`);
  }
  
  return lines.join('\n');
}
```

**invite.ts - shareInvite function:**
```typescript
export function shareInvite(link: string, gameName?: string, info?: RoomInviteInfo): Promise<boolean> {
  const title = gameName ? `Join my ${gameName} game!` : "Game Invite";
  
  // For native share, do NOT embed URL in text - use url parameter only
  const text = info ? buildInviteMessage(info, false) : undefined;
  
  if (navigator.share) {
    return navigator.share({ title, text: text || title, url: link })
      .then(() => true)
      .catch(() => false);
  }
  return navigator.clipboard.writeText(link).then(() => true).catch(() => false);
}
```

The other share functions (whatsappInvite, smsInvite, etc.) still use `buildInviteMessage(info)` which includes the link - this is correct because they construct their own share URLs.

---

## Summary of All Changes

| File | Change |
|------|--------|
| `src/hooks/useTurnTimer.ts` | Reset timer only when `enabled && isMyTurn` |
| `src/pages/BackgammonGame.tsx` | `isMyTurn: isActuallyMyTurn` (match enabled) |
| `src/pages/DominosGame.tsx` | `isMyTurn: isActuallyMyTurn` (match enabled) |
| `src/lib/invite.ts` | Don't embed URL in native share text |

---

## Expected Results

### Turn Timer
- Only active player's device runs countdown
- Opponent sees static timer display
- No duplicate timeout submissions
- 3 missed turns → clean auto-forfeit (single authority)

### Mobile Share
- Native share opens links correctly
- No "webpage not available" errors
- Copy Link still works as fallback

---

## Acceptance Tests

1. **Turn Timer (2 devices)**
   - Start private chess game with 10s timer
   - Verify only active player's timer counts down
   - Let timer expire → turn switches cleanly
   - 3 misses → auto-forfeit, opponent wins

2. **Mobile Share**
   - Create private room on mobile
   - Share via WhatsApp/SMS native share
   - Link opens without "webpage not available"
   - Recipient can join the game

