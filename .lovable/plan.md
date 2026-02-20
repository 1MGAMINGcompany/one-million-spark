
# Fix: Same-Tab Navigation + Free Rooms in Room List

## The Two Problems (Root Cause Analysis)

### Problem 1 — Wallet Disconnects When "Play vs AI" Opens

The current code uses `window.open('/play-ai/${selectedGameKey}', '_blank')` in TWO places:
- Line 677: "Play vs AI while waiting" card in the searching phase
- Line 764: "Play vs AI" button on the timeout screen

**Why this breaks wallets:** On mobile (Solflare, Phantom in-app browser, PWA mode), `window.open` either fails silently, triggers a full page reload in the same window, or opens a new context that loses the Privy session iframe. For external wallets (Solflare browser), opening a new tab in the same app context causes the wallet extension to reassign its active session. The result is both tabs see a disconnected wallet.

**For the PWA download case:** A PWA running in standalone mode has no concept of "open new tab" — `window.open` often just navigates the current page, destroying the QuickMatch listener and the user loses their room.

**The fix:** Replace both `window.open` calls with same-tab `navigate()`. But we need to preserve the user's room state so they can get back. This is done by storing the room PDA in `sessionStorage` before navigating, and reading it back when they return.

### Problem 2 — Free Rooms Never Appear in Room List

**Why:** `RoomList.tsx` uses `useSolanaRooms()` → `fetchOpenPublicRooms()` which only reads **on-chain Solana accounts**. Free rooms (`free-UUID`) have zero on-chain footprint — they only exist in the database. They are invisible to the Room List entirely.

Additionally, `findMyActiveGameSessions()` in `useSolanaRooms.tsx` calls the `game-sessions-list` edge function with `type: "recoverable_for_wallet"` — but that query filters by `status = 'active'` only. A **waiting** free room (created but no opponent yet) has `status = 'waiting'`, so after a wallet reconnect, your own room is also invisible.

---

## Complete Fix Plan

### Fix 1 — Same-Tab Navigation for "Play vs AI"

**File: `src/pages/QuickMatch.tsx`**

**Step A — Before navigating, save room to sessionStorage:**
```ts
sessionStorage.setItem('quickmatch_pending_room', JSON.stringify({
  roomPda: createdRoomPda,
  gameKey: selectedGameKey,
  stake: selectedStake,
  savedAt: Date.now(),
}));
navigate(`/play-ai/${selectedGameKey}`);
```

**Step B — On component mount, restore from sessionStorage:**
Add a `useEffect` on mount that reads `quickmatch_pending_room`. If found AND the saved time is within 15 minutes AND we're in "selecting" phase, it:
1. Restores `createdRoomPda`
2. Sets phase back to `"searching"` 
3. Clears the sessionStorage key (consumed)
4. Shows a toast: "Welcome back! Still searching for an opponent..."

This means when the user presses Back from the AI game, they land on QuickMatch, the component mounts, sees the stored room, and instantly resumes the searching phase — wallet still connected, realtime listener still working, no reconnection needed.

**Step C — Replace both `window.open` calls with `navigate()`:**
- Line 677: `window.open('/play-ai/${selectedGameKey}', '_blank')` → `navigate('/play-ai/${selectedGameKey}')`
- Line 764: same replacement

**Step D — Add a "← Back to my room" breadcrumb on the AI pages (optional safety net):**
Not required for the fix, but nice. The sessionStorage key acts as the signal — if it exists when the user opens an AI page, the AI page could show a small "← You have a room waiting" banner. This is optional and low priority.

### Fix 2 — Free Rooms in Room List

**Part A — Fix `game-sessions-list` edge function**

**File: `supabase/functions/game-sessions-list/index.ts`**

Add a new request type `free_rooms_public`:
```ts
if (type === 'free_rooms_public') {
  // All waiting free rooms created in the last 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('game_sessions')
    .select('room_pda, game_type, status, player1_wallet, player2_wallet, created_at, max_players, mode')
    .eq('mode', 'free')
    .eq('status', 'waiting')
    .gte('created_at', fifteenMinAgo)
    .order('created_at', { ascending: false })
    .limit(50)
  // return data
}
```

Also fix the `recoverable_for_wallet` query to include `waiting` free rooms — change `.eq('status', 'active')` to `.in('status', ['active', 'waiting'])` so a user's own waiting free room shows up after a reconnect.

**Part B — Add "Free Rooms" section to `RoomList.tsx`**

**File: `src/pages/RoomList.tsx`**

Add a new state: `freeRooms` (array of free waiting rooms), and fetch it every 10 seconds (alongside the existing `myActiveSessions` fetch). No wallet required to VIEW; wallet required to JOIN.

The new section renders **above** the on-chain room list with:
- Header: "🆓 Free Rooms" with a count badge
- Each room card shows: game icon, game name, "FREE" badge in green, player count (1/2), "Created X min ago"
- If the user's wallet matches `player1_wallet`: show "Your Room 🟢" badge + "Rejoin" + "Cancel" buttons
- Otherwise: show a "Join Free" button that calls `free-match` with `action: "find_or_create"` for that specific game type

**Part C — Add `join_specific` action to `free-match` edge function**

**File: `supabase/functions/free-match/index.ts`**

When a user clicks "Join Free" on a specific room in the Room List, we need to join that exact room (not a random one). Add a `join_specific` action:
```ts
if (action === 'join_specific') {
  const { roomPda, wallet } = body
  // Fetch the specific room
  // Verify it's still waiting and user isn't already in it
  // Join it exactly like the existing join logic
  // Return { status: 'joined', roomPda }
}
```

After joining via `join_specific`, navigate the user directly to `/play/${roomPda}`.

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/QuickMatch.tsx` | Replace `window.open` with same-tab `navigate()`; add mount-time sessionStorage restore; store room in sessionStorage before AI navigation |
| `supabase/functions/game-sessions-list/index.ts` | Add `free_rooms_public` type; fix `recoverable_for_wallet` to include `waiting` status |
| `supabase/functions/free-match/index.ts` | Add `join_specific` action |
| `src/pages/RoomList.tsx` | Add Free Rooms section with 10s polling, own-room detection, Rejoin/Cancel/Join Free buttons |

No database schema changes. No new routes. No new dependencies.

---

## What the Room List Will Look Like

```text
╔══════════════════════════════════════════════╗
║  🆓 FREE ROOMS  (3 waiting)                  ║
╠══════════════════════════════════════════════╣
║  🎯 Ludo  │ FREE  │ 1/2 players              ║
║  Created 2 min ago                           ║
║                               [Join Free]    ║
╠══════════════════════════════════════════════╣
║  🁡 Dominos  │ FREE  │ 1/2  🟢 Your Room     ║
║  Waiting for opponent...                     ║
║         [Rejoin]          [Cancel]           ║
╠══════════════════════════════════════════════╣
║  ♟️ Chess  │ FREE  │ 1/2 players              ║
║  Created 7 min ago                           ║
║                               [Join Free]    ║
╚══════════════════════════════════════════════╝
```

---

## What the "Play vs AI" Flow Looks Like Now

```text
Before (broken):
QuickMatch (searching) → window.open → New Tab
  Tab 1: Wallet disconnects ❌
  Tab 2: New session, also disconnected ❌

After (fixed):
QuickMatch (searching) → sessionStorage.setItem(roomPda) → navigate('/play-ai/dominos')
  Same tab: Wallet stays connected ✅
  User presses Back → QuickMatch mounts → reads sessionStorage → resumes searching ✅
  Opponent joins → realtime fires → navigate('/play/free-xxx') ✅
```

---

## Why No New Tab Is Correct for PWA + Mobile

In PWA standalone mode and in-app wallet browsers:
- `window.open` either fails silently or replaces the current page
- Multiple contexts share a single wallet session — splitting them causes disconnects
- "Back" navigation in the same tab is the standard mobile pattern

Chess.com and similar apps navigate same-tab with a "← Back to queue" button — not a new tab.
