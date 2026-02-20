
# Fix: Translate "Play for SOL" Button + Add "Play vs AI Free" Button on Home Game Cards

## What's Broken

The `FeaturedGameCard` component has two hardcoded English strings that are never translated:
- `"Play for SOL"` — the translation key `home.playForSol` already exists in all 10 languages but is never used
- `"Skill-based match"` — the translation key `home.skillBasedMatch` also exists in all 10 languages but is never used

There is also **no "Play vs AI Free" button** on the home page game cards. Users who scroll down to the featured games section have no direct path to practice — they must navigate to `/play-ai` and then pick a game a second time.

## What Changes

### 1. `src/components/FeaturedGameCard.tsx`

- Add `useTranslation` hook
- Replace hardcoded `"Play for SOL"` → `{t("home.playForSol")}`
- Replace hardcoded `"Skill-based match"` → `{t("home.skillBasedMatch")}`
- Add a new `aiPath` prop to the interface
- Add a second button below the gold "Play for SOL" button — a simpler outlined "Play vs AI Free" button that links to `aiPath`
- This button uses the already-translated `home.playAiFree` key (exists in all 10 locales)

### 2. `src/pages/Home.tsx`

- Add `aiPath` to each game in the `featuredGames` array, mapping to the correct AI route:

| Game | aiPath |
|------|--------|
| Chess | `/play-ai/chess` |
| Dominos | `/play-ai/dominos` |
| Backgammon | `/play-ai/backgammon` |
| Checkers | `/play-ai/checkers` |
| Ludo | `/play-ai/ludo` |

- Pass `aiPath` down to `<FeaturedGameCard />` for each game

### No locale file changes needed

All three translation keys already exist in all 10 languages:
- `home.playForSol` — ✅ all 10 locales
- `home.skillBasedMatch` — ✅ all 10 locales  
- `home.playAiFree` — ✅ all 10 locales (e.g. Japanese: `"AI対戦（無料）"`, Arabic: `"العب ضد الذكاء الاصطناعي (مجاناً)"`)

## Visual Result (per game card)

```text
┌─────────────────────────────┐
│       [Game Icon]           │
│       Game Name             │
│       tagline               │
│                             │
│  [🔶 Play for SOL       ]   │  ← gold button, now translated
│     Skill-based match       │  ← subtitle, now translated
│                             │
│  [  Play vs AI Free    ]    │  ← NEW outlined button, translated
└─────────────────────────────┘
```

## Files to Change

| File | What changes |
|------|-------------|
| `src/components/FeaturedGameCard.tsx` | Add `useTranslation`, use `t()` for both button texts, add `aiPath` prop, add second AI button |
| `src/pages/Home.tsx` | Add `aiPath` to each game entry, pass it to `FeaturedGameCard` |
