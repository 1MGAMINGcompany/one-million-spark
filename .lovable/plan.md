

# Fix: Translate Game Tips and Onboarding Text

## Issues Found

1. **ProactiveGameTip texts are NOT translated** -- all 5 AI game pages pass hardcoded English strings:
   - `"Tap the dice to roll, then tap a piece to move"` (Ludo)
   - `"Tap a piece to see where it can move"` (Chess)
   - `"Tap a piece, then tap where to jump"` (Checkers)
   - `"Tap the dice to roll, then tap a checker to move"` (Backgammon)
   - `"Tap a tile from your hand to play it"` (Dominos)

2. **LudoOnboardingOverlay texts are NOT translated** -- hardcoded:
   - "Roll the dice!"
   - "Tap a piece to move it!"

3. **Game-specific tips DO work correctly** -- each page passes the right tip for its game type. No issue here.

4. **Ludo layout IS correct** -- dice is beneath the board in both AI and multiplayer versions. Both use the same `LudoBoard` + `EgyptianDice` component arrangement. No issue here.

## Plan

### 1. Add translation keys to English locale (`src/i18n/locales/en.json`)

Add under a new `"tips"` section:
```
"tips": {
  "ludo": "Tap the dice to roll, then tap a piece to move",
  "chess": "Tap a piece to see where it can move",
  "checkers": "Tap a piece, then tap where to jump",
  "backgammon": "Tap the dice to roll, then tap a checker to move",
  "dominos": "Tap a tile from your hand to play it",
  "onboardingRoll": "Roll the dice!",
  "onboardingMove": "Tap a piece to move it!"
}
```

### 2. Add same keys to all 9 other locale files

Translate the tips into Spanish, Portuguese, French, German, Arabic, Chinese, Italian, Japanese, and Hindi.

### 3. Update each AI game page to use `t()` for tip text

Replace hardcoded strings with `t('tips.ludo')`, `t('tips.chess')`, etc. Each page already imports `useTranslation`.

### 4. Update `LudoOnboardingOverlay` to accept translated strings

Either pass translated strings as props from `LudoAI.tsx`, or add `useTranslation` to the component and use `t('tips.onboardingRoll')` and `t('tips.onboardingMove')` directly.

## Files Modified

| File | Change |
|------|--------|
| `src/i18n/locales/en.json` | Add `tips` section |
| `src/i18n/locales/es.json` | Add translated `tips` section |
| `src/i18n/locales/pt.json` | Add translated `tips` section |
| `src/i18n/locales/fr.json` | Add translated `tips` section |
| `src/i18n/locales/de.json` | Add translated `tips` section |
| `src/i18n/locales/ar.json` | Add translated `tips` section |
| `src/i18n/locales/zh.json` | Add translated `tips` section |
| `src/i18n/locales/it.json` | Add translated `tips` section |
| `src/i18n/locales/ja.json` | Add translated `tips` section |
| `src/i18n/locales/hi.json` | Add translated `tips` section |
| `src/pages/LudoAI.tsx` | Use `t('tips.ludo')` in ProactiveGameTip |
| `src/pages/ChessAI.tsx` | Use `t('tips.chess')` in ProactiveGameTip |
| `src/pages/CheckersAI.tsx` | Use `t('tips.checkers')` in ProactiveGameTip |
| `src/pages/BackgammonAI.tsx` | Use `t('tips.backgammon')` in ProactiveGameTip |
| `src/pages/DominosAI.tsx` | Use `t('tips.dominos')` in ProactiveGameTip |
| `src/components/LudoOnboardingOverlay.tsx` | Add `useTranslation` and use `t()` for both step labels |

## What Does NOT Change

- Ludo board layout (already correct -- dice beneath board)
- Game logic or engines
- ProactiveGameTip component itself (it already accepts any string)
- Session continuity or Money AI helper

