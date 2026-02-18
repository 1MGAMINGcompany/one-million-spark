

# Quick Match Feature

## Overview

Add a "Quick Match" button that simplifies the matchmaking flow: pick a game, pick a stake, tap one button. The system first searches for an existing open room that matches criteria. If found, auto-navigate to join it. If not, create a new room and wait up to 60 seconds with a searching UI. After timeout, offer fallback options.

## User Flow

```text
1. User taps "Quick Match" (from Home or Room List)
2. Quick Match page appears:
   - Pick game (Chess/Dominos/Backgammon/Checkers/Ludo)
   - Pick stake preset (Free / 0.01 / 0.05 / 0.1 SOL)
   - Tap "Find Match"
3. System searches existing open rooms matching game + stake
   - If match found --> navigate to /room/:pda (join flow)
   - If no match --> create a new room, show searching screen
4. Searching screen (60s countdown):
   - Animated "Searching for opponent..." with timer
   - If opponent joins (via realtime/polling) --> navigate to /play/:pda
   - If 60s expires --> show 3 options:
     a) "Keep Searching" (reset timer, keep waiting)
     b) "Play vs AI (Free)" (navigate to /play-ai)
     c) "Cancel" (navigate back)
```

## Files to Create

### 1. `src/pages/QuickMatch.tsx` -- New page (main feature)

**State machine with 3 phases:**
- `selecting` -- Game + stake picker UI
- `searching` -- Looking for opponent (countdown timer)  
- `timeout` -- 60s expired, show fallback options

**Selecting phase:**
- 5 game cards (reuse GameIcons components)
- 4 stake preset buttons: Free, 0.01, 0.05, 0.1 SOL
- "Find Match" gold CTA button
- Requires wallet connection (show PrivyLoginButton if not)

**Searching phase:**
- Calls `fetchRooms()` from `useSolanaRooms` to get current open rooms
- Filters for matching `gameType` + `entryFeeSol` (with small tolerance for SOL amounts)
- If match found: navigate to `/room/:pda`
- If no match: call `createRoom()` to create a new public room, then wait
- Shows animated searching indicator + 60s countdown
- Uses `useRoomRealtimeAlert` for instant opponent detection
- Uses `activeRoom` polling (already 5s interval) as fallback

**Timeout phase:**
- "No opponent found yet" message
- Three buttons: Keep Searching, Play vs AI, Cancel

### 2. `src/i18n/locales/*.json` -- Add quickMatch translation keys (all 10 locales)

New `quickMatch` section:
- `title`: "Quick Match"
- `selectGame`: "Select Game"
- `selectStake`: "Select Stake"  
- `free`: "Free"
- `findMatch`: "Find Match"
- `searching`: "Searching for opponent..."
- `matchFound`: "Match found!"
- `noOpponent`: "No opponent found yet"
- `keepSearching`: "Keep Searching"
- `playAI`: "Play vs AI (Free)"
- `cancel`: "Cancel"
- `connectFirst`: "Sign in to play"

## Files to Modify

### 3. `src/App.tsx` -- Add route

Add `/quick-match` route pointing to the new QuickMatch page.

### 4. `src/pages/Home.tsx` -- Add Quick Match CTA button

Add a prominent "Quick Match" button in the hero CTA area, positioned as the primary action above "Create Game Room" and "View Public Rooms". Uses the `Zap` icon for speed/instant feel.

### 5. `src/pages/RoomList.tsx` -- Add Quick Match button in header

Add a "Quick Match" button next to the existing "Create Room" button in the Room List header.

## Technical Details

- **Room matching logic**: Filter `rooms` array from `useSolanaRooms` by `gameType` number and `entryFeeSol` equality (for free: `=== 0`, for paid: within 0.001 SOL tolerance)
- **Room creation**: Reuse `createRoom()` from `useSolanaRooms` hook with the same flow as CreateRoom page (including `record_acceptance`, `game-session-set-settings` edge function calls)
- **Opponent detection**: Reuse existing `useRoomRealtimeAlert` hook + `activeRoom` polling from `useSolanaRooms`
- **No new backend changes**: Uses existing room creation/joining infrastructure
- **Blocking room check**: Uses `hookBlockingRoom` from `useSolanaRooms` same as CreateRoom/RoomList

## Layout on Mobile

```text
+----------------------------------+
|  [back]  Quick Match             |
+----------------------------------+
|                                  |
|  Select Game                     |
|  [Chess] [Dominos] [Backgammon]  |
|  [Checkers]  [Ludo]              |
|                                  |
|  Select Stake                    |
|  [Free] [0.01] [0.05] [0.1]     |
|                                  |
|  [====  Find Match  ====]       |
|                                  |
+----------------------------------+
```

