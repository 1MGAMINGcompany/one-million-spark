

# Reorganize Homepage CTA Layout & Update Button Labels

## Overview
Restructure the homepage call-to-action buttons so "Play Free" is the most prominent top action, reorder the remaining buttons, and change "Enter Training" to "Play Free" on the AI lobby page.

## Changes

### 1. Homepage CTA reorder (`src/pages/Home.tsx`, lines 115-151)

Replace the current button stack with the new hierarchy:

**PRIMARY** (top, biggest, gold variant):
- "Play Free" button linking to `/play-ai`
- Subtext: "Practice first. No SOL required."
- Uses `Bot` icon

**SECONDARY** (below, gold variant but slightly less prominent):
- "Quick Match (Win SOL)" button linking to `/quick-match`
- Subtext: "Play real opponents. Winner takes the SOL pool."
- Uses `Zap` icon

**TERTIARY** (side-by-side outline buttons, same as current):
- "Create Room" linking to `/create-room`
- "View Public Rooms" linking to `/room-list`

### 2. PlayAILobby button text (`src/pages/PlayAILobby.tsx`, line 242)

Change `{t("playAi.enterTraining")}` to `{t("playAi.playFree")}` (new i18n key).

### 3. i18n updates (all 10 locale files)

- Add `playAi.playFree` key (e.g. EN: "Play Free", ES: "Jugar Gratis", etc.)
- Add `home.playFreeSub` key (EN: "Practice first. No SOL required.")
- Add `home.quickMatchWinSol` key (EN: "Quick Match (Win SOL)")
- Add `home.quickMatchWinSolSub` key (EN: "Play real opponents. Winner takes the SOL pool.")
- Update `home.playAiFree` to "Play Free" (shorter label)

### 4. FeaturedGameCard -- swap button order (`src/components/FeaturedGameCard.tsx`)

Move the "Play vs AI Free" button above the "Play for SOL" button and update its label to "Play Free" to match the new hierarchy. The SOL button becomes secondary below it.

## Files changed

| File | Change |
|------|--------|
| `src/pages/Home.tsx` | Reorder CTA buttons: Play Free on top, Quick Match second |
| `src/pages/PlayAILobby.tsx` | Change button text from enterTraining to playFree |
| `src/components/FeaturedGameCard.tsx` | Swap button order, Play Free on top |
| `src/i18n/locales/en.json` | Add new keys, update labels |
| `src/i18n/locales/es.json` | Add translated keys |
| `src/i18n/locales/fr.json` | Add translated keys |
| `src/i18n/locales/de.json` | Add translated keys |
| `src/i18n/locales/pt.json` | Add translated keys |
| `src/i18n/locales/it.json` | Add translated keys |
| `src/i18n/locales/ar.json` | Add translated keys |
| `src/i18n/locales/hi.json` | Add translated keys |
| `src/i18n/locales/ja.json` | Add translated keys |
| `src/i18n/locales/zh.json` | Add translated keys |

