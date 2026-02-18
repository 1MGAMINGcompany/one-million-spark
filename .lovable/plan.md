

# Ludo Quick Match: Multi-Player Support (2/3/4)

## Overview

Add a player-count selector to Quick Match when Ludo is selected, so users can choose 2, 3, or 4 players. The room creation and waiting logic will use the correct `maxPlayers` value, and the existing backend infrastructure (`maybe_activate_game_session`) already handles multi-player activation correctly -- no backend changes needed.

## Why This Works Without Backend Changes

The `maybe_activate_game_session` RPC already checks `acceptances >= max_players AND participants >= max_players` before transitioning `status_int` from 1 to 2. The `useRoomRealtimeAlert` hook fires on that 1-to-2 transition. So for a 3-player Ludo room, the realtime alert will only fire when the 3rd player joins and the DB status flips to active. No edge function or DB changes required.

## Changes

### File: `src/pages/QuickMatch.tsx`

1. **New state**: `ludoPlayerCount` (default 2), only visible when Ludo is selected
2. **Player count selector UI**: Shown below game selection when Ludo is selected -- 3 buttons for 2/3/4 players
3. **Room creation**: Use `ludoPlayerCount` instead of hardcoded `4` for `maxPlayers` when game is Ludo
4. **Room matching**: Also match on `maxPlayers` for Ludo rooms (so a 2p searcher doesn't join a 4p room)
5. **Searching phase**: Show "Waiting for players: X / N" text for Ludo 3/4p instead of generic "searching for opponent"
6. **Searching phase actions**: Add "Switch to 2 Players" button (navigates back to selecting phase with 2p preset) and copy invite link button for Ludo 3/4p
7. **Reset `ludoPlayerCount` to 2** when switching away from Ludo

### File: `src/i18n/locales/*.json` (all 10 locale files)

Add new translation keys to the `quickMatch` section:

| Key | English |
|-----|---------|
| `selectPlayers` | "Number of Players" |
| `players` | "{{count}} Players" |
| `waitingForPlayers` | "Waiting for players: {{current}} / {{total}}" |
| `switchTo2Players` | "Switch to 2 Players (faster)" |
| `copyInviteLink` | "Copy Invite Link" |
| `linkCopied` | "Link copied!" |

Translated appropriately for es, ar, pt, fr, de, zh, it, ja, hi.

## Technical Details

- The `maxPlayers` field is passed to `createRoom()` (on-chain), `game-session-set-settings` (edge function), and `record_acceptance` (DB) -- all already accept variable `maxPlayers`
- Room matching adds a check: for Ludo, also compare `r.maxPlayers === ludoPlayerCount` (the `RoomDisplay` type from `solana-program` includes `maxPlayers`)
- "Switch to 2 Players" simply sets `ludoPlayerCount = 2`, resets phase to `selecting`, and clears `createdRoomPda` -- the existing on-chain room will time out via `maybe_apply_waiting_timeout` (120s)
- The invite link copy reuses the same pattern from `WaitingForOpponentPanel`
- No forfeit, settlement, timer, or game logic changes

## Files Modified

| File | Change |
|------|--------|
| `src/pages/QuickMatch.tsx` | Add player count selector, update room creation/matching, update searching phase UI |
| `src/i18n/locales/en.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/es.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/ar.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/pt.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/fr.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/de.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/zh.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/it.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/ja.json` | Add 6 new quickMatch keys |
| `src/i18n/locales/hi.json` | Add 6 new quickMatch keys |

