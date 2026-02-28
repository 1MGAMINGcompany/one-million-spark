

# Enhance "Play Free" Button with Game Icons

## What Changes

The "Play Free" CTA button on the home page will be redesigned to:

1. **Make "PLAY FREE" text larger** -- bump from `text-2xl md:text-3xl` to `text-3xl md:text-4xl` for maximum impact
2. **Add a row of 5 small game icons with names** underneath the subtext, showing Chess, Dominos, Backgammon, Checkers, and Ludo mini-icons with labels

## Visual Layout

```text
+----------------------------------------------------+
|           🤖  PLAY FREE                             |
|        Practice first. No SOL required.             |
|                                                     |
|  [Chess]  [Dominos]  [Backgammon] [Checkers] [Ludo] |
|   Chess   Dominos   Backgammon   Checkers    Ludo   |
+----------------------------------------------------+
```

Each game icon will be a small (w-8 h-8) version of the existing `ChessIcon`, `DominoIcon`, etc. with the game name in tiny text (text-[10px]) below it.

## File Changed

**`src/pages/Home.tsx`** (single file)

- Import the 5 game icon components (already imported for the featured games section)
- Replace the current Play Free button content with:
  - Larger "PLAY FREE" heading (`text-3xl md:text-4xl`)
  - Existing subtext line
  - A flex row of 5 icon+label pairs, spaced evenly, using the existing game icon SVG components at small size
- Game labels will use the existing `t("games.chess")` etc. translation keys

No new files, no new dependencies, no backend changes.

