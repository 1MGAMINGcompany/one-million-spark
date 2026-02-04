# POST-REVERT IMPLEMENTATION GUIDE
> Created: Feb 4, 2026 - Before reverting to stable Jan 21-22 version
> Purpose: Reference for fixing backgammon, adding private rooms, and security hardening

---

## 🎯 PHASE 1: Backgammon Board Fix (Cosmetic Only)

### Known Issue
Multiplayer backgammon board layout was broken - likely orientation/positioning for player 2.

### Files to Check
- `src/pages/BackgammonGame.tsx` - Main game component
- `src/components/BackgammonPieces.tsx` - Checker rendering
- Related CSS in component or index.css

### Likely Fixes
1. **Board orientation**: Player 2 may need `transform: rotate(180deg)` or reversed point indices
2. **Point numbering**: Ensure points 1-24 are correctly mapped for both perspectives
3. **Checker placement**: Grid/flex positioning may need player-specific offsets

### Testing
- Create 2-player game, check both players see correct orientation
- Verify checkers appear on correct points
- Test bearing off from correct home board

---

## 🟣 PHASE 2: Private Rooms (Correct Pattern)

### Architecture (from working memory)
```
Mode: 'private' (distinct from 'ranked' and 'casual')
Theme: Violet accents, 🟣 badge
Visibility: NOT in public RoomList
Access: Invite links only
```

### Database Requirements
```sql
-- game_sessions.mode can be: 'casual', 'ranked', 'private'
-- No new tables needed - reuse existing structure
```

### Invite Link Structure
```
/room/{roomPda}?invite=true&game={gameType}&stake={stakeSol}&payout={payoutSol}&turn={turnSeconds}
```

### Implementation Checklist
- [ ] `CreateRoom.tsx`: Add \"Private\" toggle, set mode='private'
- [ ] `RoomList.tsx`: Filter out `mode = 'private'` from public list
- [ ] `game-session-set-settings`: Accept mode='private' in upsert
- [ ] `Room.tsx`: Show violet theme when mode='private'
- [ ] `ShareInviteDialog.tsx`: Generate metadata-rich invite links
- [ ] `JoinRoom.tsx`: Parse invite params, show stake/rules before joining

### Readiness Flow (Keep Simple!)
```
1. Creator creates private room → gets invite link
2. Opponent opens link → sees rules modal with stake/time
3. Opponent accepts → records in game_acceptances
4. Creator accepts → records in game_acceptances  
5. Both accepted → game starts (NO auto-healing RPCs!)
```

---

## 🔒 PHASE 3: Security Hardening (Add Slowly)

### Priority Order
1. **Session Token Validation** (already exists via requireSession)
2. **Input Validation** (zod schemas)
3. **Rate Limiting** (edge function level)
4. **Wallet Spoofing Prevention** (zero-trust principle)

### Zero-Trust Wallet Principle ✅
```typescript
// CORRECT - derive wallet from session
const result = await requireSession(supabase, req);
if (!result.ok) return errorResponse(401, result.error);
const callerWallet = result.session.wallet; // AUTHORITATIVE

// WRONG - never trust request body
const { playerWallet } = await req.json(); // NEVER USE FOR IDENTITY
```

### Input Validation Pattern
```typescript
import { z } from 'zod';

const moveSchema = z.object({
  type: z.enum(['turn_end', 'game_over', 'auto_forfeit']),
  nextTurnWallet: z.string().min(32).max(44).optional(),
  // ... other fields
});

// Validate before processing
const parsed = moveSchema.safeParse(body);
if (!parsed.success) return errorResponse(400, 'Invalid move data');
```

### Rate Limiting (Simple Pattern)
```typescript
// In edge function
const rateLimitKey = `ratelimit:${callerWallet}:${action}`;
const count = await redis.incr(rateLimitKey);
if (count === 1) await redis.expire(rateLimitKey, 60);
if (count > 10) return errorResponse(429, 'Rate limited');
```

### Session Security
- 7-day TTL (already enforced in requireSession)
- Revocation on suspicious activity
- Room-specific tokens (session_token_${roomPda})

---

## ❌ DO NOT REINTRODUCE (Critical!)

### Self-Healing Anti-Patterns
```typescript
// ❌ NEVER DO THIS - causes race conditions
PERFORM maybe_activate_game_session(p_room_pda);  // in every RPC
PERFORM maybe_finalize_start_state(p_room_pda);   // auto-called

// ✅ INSTEAD - explicit activation at correct moment
// Only call activation ONCE when both players have accepted
```

### Complex Fallback Chains
```typescript
// ❌ NEVER DO THIS
try { await method1(); } 
catch { 
  try { await method2(); } 
  catch { 
    try { await method3(); } // Too many paths!
    catch { /* silent fail */ }
  }
}

// ✅ INSTEAD - one clear path with explicit error
const result = await primaryMethod();
if (!result.ok) return { error: result.error }; // Let caller handle
```

### DB-Authoritative Blocking (Overcomplicated)
```typescript
// ❌ NEVER DO THIS - created \"Room Paradox\"
const onChainRooms = await fetchActiveRoomsForUser();
const dbRooms = await fetchFromDatabase();
const blocking = onChainRooms.filter(r => !dbRooms.find(...)); // Complex!

// ✅ INSTEAD - simple on-chain check
const activeRoom = await fetchActiveRoomsForUser(wallet);
if (activeRoom) return { blocking: activeRoom };
```

### Neutral Transition UI Layers
```typescript
// ❌ NEVER DO THIS - causes flicker
setOutcomeResolving(true);
setGameOver(true);
// ... wait for DB ...
setWinnerWallet(winner);
setOutcomeResolving(false); // Multiple state updates = flicker

// ✅ INSTEAD - single state update
setGameResult({ gameOver: true, winner }); // Atomic
```

---

## 🧪 PHASE 4: Testing Checklist

### Before Each Feature
- [ ] Test on desktop Chrome
- [ ] Test on mobile Safari (in-app browser)
- [ ] Test on Phantom mobile browser
- [ ] Test with 2 devices simultaneously

### Multiplayer Flow
- [ ] Create room → get PDA
- [ ] Share link → opponent joins
- [ ] Both see start roll
- [ ] Turns alternate correctly
- [ ] Timeout works (3-strike rule)
- [ ] Forfeit settles correctly
- [ ] Winner receives funds

### Private Room Flow
- [ ] Create private room → link generated
- [ ] Room NOT visible in public list
- [ ] Invite link shows correct stake/time
- [ ] Both players must accept rules
- [ ] Game starts after both accept
- [ ] Settlement works same as ranked

---

## 📋 Quick Reference

### Status Int Values
```
1 = Waiting (room created, waiting for players)
2 = Active (game in progress)
3 = Finished (game ended, settled)
4 = Void (settlement failed)
5 = Cancelled (room closed before active)
```

### Key Files
```
src/hooks/useSolanaRooms.ts - Room creation/joining
src/hooks/useForfeit.ts - Forfeit handling
src/pages/Room.tsx - Room entry point
supabase/functions/forfeit-game - Settlement
supabase/functions/ranked-accept - Join flow
supabase/functions/recover-funds - Stuck room recovery
```

### Working Memories to Preserve
- `solana-multiplayer-stale-closure-heartbeat-fix` (6w ago) - Core sync
- `multiplayer-forfeit-settlement-logic` (2w ago) - Simple forfeit
- `mobile-first-joining-invite-ux` (1w ago) - Deep links
- `private-room-system-v1` (1d ago) - Private room pattern

---

## 🚀 Implementation Order

1. **Revert** to Jan 21-22 stable version
2. **Fix** backgammon board (CSS only)
3. **Test** all multiplayer games work
4. **Add** private rooms (simple pattern above)
5. **Test** private room flow
6. **Add** security hardening (one item at a time)
7. **Test** after each security addition

**Golden Rule**: After each change, test on mobile Phantom browser before proceeding!
