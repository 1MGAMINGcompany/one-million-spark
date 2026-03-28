

# Filter to Main "Who Wins" Markets Only

## Problem
Polymarket imports multiple markets per matchup: the main "who wins" plus props like "Fight Goes The Distance", "Over/Under Rounds", "Method of Victory", etc. Currently all are displayed. The user only wants the main win/lose prediction shown.

## Solution
Add a filter function that identifies and hides prop/secondary markets, keeping only the primary "who wins" market for each matchup.

## Detection Logic — `isPropMarket(fight)`
A fight is a prop market if ANY of these match (case-insensitive on title):
- `detectSport(fight) === "over_under"` (fighter names are Over/Under)
- Title contains: "goes the distance", "total rounds", "method of victory", "decision", "knockout", "submission", "stoppage", "O/U", "over/under"
- Fighter names are "Over" / "Under" or "Yes" / "No" (for non-soccer events)

Soccer binary Yes/No markets are NOT props — they are the main market structure.

## File Changes

### `src/lib/detectSport.ts`
- Export new `isPropMarket(fight)` function with the detection logic above

### `src/components/predictions/EventSection.tsx`
- Import `isPropMarket`
- In `SoccerAwareGrid`, filter out prop markets from the fights array before rendering
- This single filter point covers all event sections (live, today, upcoming, past)

### `src/components/predictions/PredictionHighlights.tsx`
- Import `isPropMarket`
- Filter out prop markets from `enrichedFights` in the useMemo

## What stays visible
- Main "Fighter A vs Fighter B" who-wins markets
- Soccer 3-way grouped cards (home/away/draw)
- All existing status/claim/refund logic unchanged

## What gets hidden
- "Fight Goes The Distance" Yes/No
- Over/Under rounds
- Method of Victory markets
- Any other prop/derivative market
