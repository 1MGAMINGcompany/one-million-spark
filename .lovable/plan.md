
# Reorder Games: Ludo → Dominos → Chess → Backgammon → Checkers

## Target Order
**Ludo, Dominos, Chess, Backgammon, Checkers**

## Every Location That Shows Game Order

There are 6 files with game ordering that all need to be updated consistently:

---

### 1. `src/pages/Home.tsx` — Featured game cards (lines 21–27)
Currently: Chess, Dominos, Backgammon, Checkers, Ludo
Fix: Reorder the `featuredGames` array entries.

### 2. `src/pages/PlayAILobby.tsx` — AI game cards (lines 16–52)
Currently: Chess, Dominos, Backgammon, Checkers, Ludo
Fix: Reorder the `aiGames` array entries. Also update the default `selectedDifficulties` keys — they use the `key` string which stays the same, order of the object doesn't matter, but the array rendering does.

### 3. `src/pages/QuickMatch.tsx` — Quick match game selector (lines 41–55)
Currently: Chess, Dominos, Backgammon, Checkers, Ludo
Fix: Reorder the `GAME_OPTIONS` array. Also update `selectedGame` default from `GameType.Chess` to `GameType.Ludo` (line 83) so the first game highlighted is Ludo.

### 4. `src/pages/CreateRoom.tsx` — Game type dropdown (lines 611–616)
Currently: Chess, Dominos, Backgammon, Checkers, Ludo
Fix: Reorder the `<SelectItem>` elements. Also update the default `gameType` state from `"1"` (Chess) to `"5"` (Ludo) on line 84 so the room creation page opens on Ludo by default.

### 5. `src/pages/GameRules.tsx` — Game rules accordion (lines 8–14)
Currently: Chess, Checkers, Backgammon, Ludo, Dominos
Fix: Reorder the `games` array entries to Ludo, Dominos, Chess, Backgammon, Checkers.

### 6. `src/pages/Leaderboard.tsx` — Game tabs (line 71)
Currently: `['chess', 'dominos', 'backgammon', 'checkers', 'ludo']`
Fix: Change to `['ludo', 'dominos', 'chess', 'backgammon', 'checkers']`. Also update the default leaderboard route in `src/components/Navbar.tsx` from `/leaderboard/chess` to `/leaderboard/ludo` (line 89) so the nav link opens on Ludo's board.

---

## Complete File Change Summary

| File | What changes |
|------|-------------|
| `src/pages/Home.tsx` | Reorder `featuredGames` array: Ludo, Dominos, Chess, Backgammon, Checkers |
| `src/pages/PlayAILobby.tsx` | Reorder `aiGames` array: Ludo, Dominos, Chess, Backgammon, Checkers |
| `src/pages/QuickMatch.tsx` | Reorder `GAME_OPTIONS` array + default selected game → Ludo |
| `src/pages/CreateRoom.tsx` | Reorder Select dropdown items + default game state → Ludo ("5") |
| `src/pages/GameRules.tsx` | Reorder `games` array: Ludo, Dominos, Chess, Backgammon, Checkers |
| `src/pages/Leaderboard.tsx` | Reorder `VALID_GAMES` array: ludo, dominos, chess, backgammon, checkers |
| `src/components/Navbar.tsx` | Update leaderboard nav link from `/leaderboard/chess` → `/leaderboard/ludo` |

No database changes needed — game type IDs (1–5) are fixed on-chain and are not reordered. Only the visual display order changes.
