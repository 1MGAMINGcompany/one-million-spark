

# Unified 3-Way Soccer Card (Like Polymarket)

## Problem
Soccer events from Polymarket are imported as 3 separate binary markets ("Will USA win? Yes/No", "Will Portugal win? Yes/No", "Draw? Yes/No"). Currently each renders as its own card with independent Yes/No columns. Polymarket combines them into a single 3-way card: **USA | DRAW | PRT** with correct prices. We need to do the same.

## Approach
Group sibling soccer fights sharing the same `event_name` into a single unified card with 3 outcome buttons (Home / Draw / Away), using each binary market's `price_a` (the "Yes" price) as the probability for that outcome.

## Changes

### 1. `src/components/predictions/EventSection.tsx`
- Before rendering FUTBOL fights, group them by `event_name` pattern
- For groups of 2-3 sibling binary markets (same event, Yes/No outcomes), pass them as a bundle to a new `SoccerMatchCard` component instead of rendering 3 separate `FightCard`s
- Solo fights or non-binary markets render as before

### 2. `src/components/predictions/SoccerMatchCard.tsx` (new file)
A unified 3-way card component that:
- Accepts `homeFight`, `awayFight`, and optional `drawFight`
- Shows 3 columns: Home flag + team name + price, Draw + price, Away flag + team name + price
- Prices come from each fight's `price_a` (the "Yes" probability in cents, like Polymarket: "39¢")
- Volume: sum of all sibling `polymarket_volume_usd`
- Single status badge, single pool strip
- 3 predict buttons that each call `onPredict(respectiveFight, "fighter_a")` (betting "Yes" on that outcome)
- Design mirrors Polymarket: compact row with flag, team name, and colored price button

### 3. `src/components/predictions/FightCard.tsx`
- No structural changes; individual binary cards still work for non-grouped fights
- Export `calcOdds`, `getPoolUsd`, `getProbabilities` so `SoccerMatchCard` can reuse them

## Grouping Logic (EventSection)
```text
For FUTBOL events:
  1. Collect all fights with fighter_a_name === "Yes" && fighter_b_name === "No"
  2. Group by event_name (the "vs." match name)
  3. Within each group, identify:
     - Home fight: title contains home team name (parsed from event_name)
     - Away fight: title contains away team name
     - Draw fight: title contains "draw" (case-insensitive)
  4. Render one SoccerMatchCard per group
  5. Any ungrouped fights render as regular FightCard
```

## Card Layout (SoccerMatchCard)
```text
┌──────────────────────────────────────────────┐
│ MATCH PREDICTION                       OPEN  │
│                                              │
│  🇺🇸              ⚽              🇵🇹          │
│ United States    DRAW          Portugal      │
│   [USA 39¢]    [DRAW 42¢]     [PRT 58¢]    │
│                                              │
│  31% ████████░░░░░░░░░ 69%                   │
│            $342 Vol.                         │
│                 View Details & Odds >        │
└──────────────────────────────────────────────┘
```

- Price buttons are colored: blue for home, gray for draw, red for away
- Prices shown in cents (price_a * 100, rounded) like Polymarket
- Volume is the sum across all sibling markets
- "View Details & Odds" links to the home team's fight detail page

## Files
- `src/components/predictions/SoccerMatchCard.tsx` — new unified 3-way card
- `src/components/predictions/EventSection.tsx` — group soccer fights before rendering
- `src/components/predictions/FightCard.tsx` — export shared utility functions

