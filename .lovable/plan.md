
# Fix Ludo Multiplayer: Layout and Dice Issues

## Problems Identified

1. **Dice positioned above/over the board**: In `LudoGame.tsx`, the dice panel uses `absolute bottom-4 left-4` positioning inside a `flex-1 relative` container. This causes it to float over the board. In contrast, `LudoAI.tsx` uses simple vertical flow layout: board first, then dice below with `mt-6`.

2. **Dice rolling forever**: When `myPlayerIndex` is -1 (players not yet loaded) or when there are only 2 human players in a 4-slot game, the AI turn effect (lines 1021-1080) treats ALL non-human slots as AI and continuously fires dice rolls for them. In a free 2-player game, slots 2 and 3 have no real players but the engine still cycles through all 4 player indices.

3. **Player labels showing "game.player"**: The TurnStatusHeader and player display show raw keys like "Gold game.player" instead of proper names -- a translation key issue.

## Fix Plan

### File: `src/pages/LudoGame.tsx`

**Change 1 -- Restructure layout to match LudoAI**

Replace the current game area layout (lines ~1219-1277):
- Remove the `flex-1 relative` wrapper with absolutely-positioned dice
- Use LudoAI's vertical flow: Turn indicator at top, board centered, dice below the board
- Keep the board inside a centered container with `px-4 flex justify-center`
- Put dice and controls in a `mt-6 flex flex-col items-center gap-4` below the board (same as LudoAI)
- Move audio controls inline with dice area
- Remove the `bg-card/90 backdrop-blur-sm` floating card wrapper around dice

Before (broken):
```
<div class="flex-1 flex items-center justify-center relative">
  <LudoBoard ... />
  <div class="absolute bottom-4 left-4">  <-- OVERLAPS BOARD
    <TurnIndicator />
    <EgyptianDice />
  </div>
</div>
```

After (matching LudoAI):
```
<div class="px-4 mb-4">
  <TurnIndicator />
</div>
<div class="px-4 flex justify-center">
  <LudoBoard ... />
</div>
<div class="mt-6 flex flex-col items-center gap-4">
  <EgyptianDice />
  <audio controls>
</div>
```

**Change 2 -- Fix AI turn effect for 2-player free games**

The AI turn effect fires for every `currentPlayerIndex !== myPlayerIndex`. In a 2-player free game with players at indices 0 and 1, indices 2 and 3 are "phantom" players with no tokens but the engine still cycles to them, triggering infinite AI rolls.

Fix: Add a guard to the AI effect -- only trigger for player indices that exist in `roomPlayers`. If `currentPlayerIndex >= roomPlayers.length`, auto-skip that turn immediately instead of trying to roll dice.

```typescript
// In the AI turn effect (~line 1021):
// Skip phantom player slots (indices beyond actual room players)
if (currentPlayerIndex >= roomPlayers.length) {
  // Auto-advance past empty slots
  advanceTurn(0);
  return;
}
```

**Change 3 -- Background styling to match LudoAI**

Update the outer container to use LudoAI's Egyptian theme background:
```
bg-gradient-to-b from-amber-950 via-amber-900 to-amber-950 pb-20
```
instead of the current generic `bg-background`.

## Technical Details

- Only `src/pages/LudoGame.tsx` needs changes
- `LudoAI.tsx` is NOT touched (as requested)
- `LudoBoard.tsx` component is unchanged -- it works correctly in both versions
- The `EgyptianDice` component is unchanged
- The fix ensures the multiplayer board renders identically to the AI version's visual layout
- The AI turn guard prevents dice from rolling for non-existent player slots in 2-player games
