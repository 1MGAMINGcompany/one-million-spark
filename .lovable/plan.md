

# Multiplayer Audit: Final Fixes for Publish Readiness

## Current State

All 5 game pages (Chess, Checkers, Dominos, Backgammon, Ludo) have:
- `effectivePlayerId` computed correctly
- Wallet gate bypass for free rooms
- `useForfeit` using `effectivePlayerId`
- `useWebRTCSync` with `overrideAddress`
- `useStartRoll` with `effectivePlayerId`

## Remaining Issues

### 1. Ludo: `hasTwoRealPlayers` not bypassed for free rooms

**File:** `src/pages/LudoGame.tsx`, line 370

The `useStartRoll` call passes raw `hasTwoRealPlayers` (which uses `isRealWallet()` -- fails for anonymous UUIDs). Chess, Checkers, and Dominos already have the fix: `hasTwoRealPlayers: isFreeRoom ? roomPlayers.length >= 2 : hasTwoRealPlayers`.

**Fix:** Change line 370 from:
```
hasTwoRealPlayers,
```
to:
```
hasTwoRealPlayers: isFreeRoom ? roomPlayers.length >= 2 : hasTwoRealPlayers,
```

### 2. Backgammon: Same `hasTwoRealPlayers` issue

**File:** `src/pages/BackgammonGame.tsx`, line 684

Same pattern -- passes raw `hasTwoRealPlayers` to `useStartRoll`.

**Fix:** Change line 684 from:
```
hasTwoRealPlayers,
```
to:
```
hasTwoRealPlayers: isFreeRoom ? roomPlayers.length >= 2 : hasTwoRealPlayers,
```

## What's Already Working

- Free games: Anonymous players can enter all 5 game pages without wallet
- Casual/Ranked (paid) games: Still require wallet connection (gate at bottom of each file)
- Turn detection, color assignment, forfeit, chat all use `effectivePlayerId`
- WebRTC uses `overrideAddress` for anonymous signaling
- Ludo engine accepts `activePlayerCount` for 2/3/4 player games
- Dice positioned below the board in Ludo multiplayer (matching AI layout)
- Phantom player slots auto-skipped in 2-player Ludo games

## Summary

Only 2 one-line fixes needed across 2 files. After these, all game modes (free anonymous, casual wallet, ranked wallet) should work correctly for all 5 games.

