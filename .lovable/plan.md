
# Fix: Free Games Requiring Wallet Connection

## Problem

When an anonymous player (no wallet) joins a free game, all 5 game pages block them with a "Connect Wallet to Play" screen. Two bugs cause this:

1. **Hard wallet gate in render**: Every game page (Ludo, Chess, Dominos, Backgammon, Checkers) has a check like `if (!walletConnected || !address) return <ConnectWallet />` that blocks the entire game UI for anonymous players.

2. **Player fetch skipped**: The `useEffect` that loads room participants has `if (!address || !roomPda) return` as the first line, so when `address` is null (anonymous), the free room DB fetch at `roomPda.startsWith("free-")` is never reached. Players array stays empty.

## Root Cause

The free matchmaking system (`QuickMatch.tsx`) correctly uses `getAnonId()` as the player identity when no wallet is connected. But the game pages still assume a wallet is always required.

## Fix (5 files)

### All game pages: LudoGame, ChessGame, DominosGame, BackgammonGame, CheckersGame

For each file, two changes:

**Change 1 - Skip wallet gate for free rooms:**

Replace:
```typescript
if (!walletConnected || !address) {
  return <ConnectWalletScreen />;
}
```

With:
```typescript
const isFreeRoom = roomPda?.startsWith("free-") ?? false;
if (!isFreeRoom && (!walletConnected || !address)) {
  return <ConnectWalletScreen />;
}
```

**Change 2 - Allow anonymous player fetch for free rooms:**

Replace:
```typescript
if (!address || !roomPda) return;
```

With logic that uses `getAnonId()` as the player identity for free rooms when no wallet is connected:
```typescript
const playerId = address || (roomPda?.startsWith("free-") ? getAnonId() : null);
if (!playerId || !roomPda) return;
```

Then use `playerId` instead of `address` in the free room fetch block.

**Change 3 - Use anon identity throughout the game page:**

Where `address` is used to determine "my player" (e.g., `myPlayerIndex`, turn detection), substitute with `address || getAnonId()` when in a free room, so the game correctly identifies the anonymous player.

## Technical Details

- `getAnonId()` from `src/lib/anonIdentity.ts` returns a persistent UUID from localStorage -- the same ID used during matchmaking
- The `free-match` edge function already stores this anon ID as the participant, so the DB session will match
- No database or edge function changes needed -- only the game page render guards and player fetch logic
- The `RulesGate` component already bypasses for non-ranked games (`if (!isRanked) return children`), so no changes needed there
