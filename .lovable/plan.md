

# Polymarket-Style Compact Cards for All Sports

## Problem
Current FightCard is complex with multipliers (2.30x), USDC pool amounts, question text, and verbose layouts. The user wants all prediction cards (MMA, Boxing, Muay Thai, etc.) to look like Polymarket: compact, fun, showing fighter photos, names, records, and odds as percentages with simple colored pick buttons.

## Design (Based on Polymarket Reference)
Each fight renders as a single compact row card:

```text
┌──────────────────────────────────────────────────────┐
│  UFC · 12:00 AM   $215K Vol.           ⑨ Game View > │
│                                                      │
│  (photo) Yousri Belgaroui 9-3-0    [YOU 44%] [MAN 57%] │
│  (photo) Mansur Abdul-Malik 9-0-1                    │
└────────────────────────────────────────────────────────┘
```

Key changes:
- **Compact row layout** — fighter photos + names on left, two colored pick buttons on right
- **Percentages** — prices shown as `44%` not `2.30x`
- **Abbreviated names** on buttons (first 3 chars of last name)
- **Fighter photos** — circular, small (40px), with sport-icon fallback
- **Records** shown inline next to name (e.g. "9-3-0")
- **Volume** in header
- **"Game View >"** links to match center
- **Blue / Red** colored buttons for fighter A / fighter B
- Winner banner, claim UI, draw/refund states all preserved but compact

## Files Changed

### `src/components/predictions/FightCard.tsx`
- Replace the entire non-soccer card render (lines 512-665) with a new compact Polymarket-style layout
- Keep all existing logic (calcOdds, status badges, claim handling, winner detection)
- Replace multiplier display (`2.30x`) with percentage display (`44%`)
- New `CompactFighterRow` sub-component: photo + name + record on left
- New `PickButton` sub-component: colored button with abbreviated name + percentage
- Remove verbose question text, pool dollar amounts, Swords icon
- Keep the soccer card path unchanged (already redesigned)
- Keep FighterColumn and SoccerTeamColumn for backward compat but the main card won't use FighterColumn anymore

### `src/components/predictions/PredictionHighlights.tsx`
- Update `HighlightCard` to use percentages instead of multipliers for consistency

## Preserved Functionality
- Status badges (OPEN, LOCKED, LIVE, etc.)
- Featured ribbon
- Winner/claim/refund/draw states
- Weight class & fight class tags
- View Details link
- Wallet gate on predict
- eventHasStarted lock logic

