
# Audit Results: Language Detection, Geolocation & AI Win Share Card

## Audit Status: MOSTLY GOOD — 3 Issues Found

Everything is fundamentally correct and working. The audit found 3 specific issues to fix, all minor.

---

## What Is Working Correctly

### Language Detection
- Detection order in `src/i18n/index.ts` is correctly set to `['navigator', 'localStorage', 'htmlTag']` — first-time visitors will get their OS/browser language automatically.
- `localStorage` is still used as a cache (`caches: ['localStorage']`) so manual selections persist across sessions.
- The `lookupLocalStorage` key `'1m-gaming-language'` is correctly configured.
- `Navbar.tsx` has a `useEffect` that syncs `document.documentElement.dir` and `document.documentElement.lang` with `i18n.language` on every language change — this handles RTL (Arabic) correctly.
- The `LanguageSelector` component also updates `dir` and `lang` when the user manually picks a language.

### AI Win Share Card
- All 5 AI game pages (`ChessAI`, `CheckersAI`, `BackgammonAI`, `DominosAI`, `LudoAI`) correctly import `AIWinShareCard`.
- All 5 pages have `showShareCard` and `winDuration` state, call `getDuration()` + `recordWin()` on win, and render `<AIWinShareCard>` with correct props.
- The component uses `useTranslation()` so all UI text (victory, buttons, share copy) renders in the active language automatically.
- The `aiWinCard` translation namespace is present and complete in **all 10 locale files** (en, hi, ar, zh, es, pt, fr, de, it, ja) with all 14 required keys.
- Share texts use `{{game}}`, `{{difficulty}}`, and `{{link}}` interpolation correctly.

### Tracking
- `useAIGameTracker` exports `{ recordWin, recordLoss, getDuration }` correctly.
- Global heartbeat is in `App.tsx` → `AppContent`, covering all routes.

---

## Issues Found

### Issue 1 — MEDIUM: `GAME_LABELS` in AIWinShareCard are hardcoded English strings

**File:** `src/components/AIWinShareCard.tsx` lines 24–30

```typescript
const GAME_LABELS: Record<string, string> = {
  chess: "Chess",       // ← always English
  checkers: "Checkers", // ← always English
  backgammon: "Backgammon",
  dominos: "Dominos",
  ludo: "Ludo",
};
```

These game name labels appear on the stat chip and in the share copy. A Hindi user sees "Chess" and "आसान" side by side — inconsistent. The game names should use the i18n system.

**Fix:** Use `t()` to look up translated game names from the locale files. We need to add 5 game name keys to the `aiWinCard` namespace (or reuse existing ones from `playAi`) and use them dynamically.

Checking the locale files, the `playAi` namespace already has per-game entries in some locales, but not consistently. The cleanest fix is to add `gameNames.chess`, `gameNames.checkers`, etc. to `aiWinCard` in all 10 locales and use `t(`aiWinCard.gameNames.${game}`)` in the component.

---

### Issue 2 — LOW: `index.html` hardcodes `lang="en"` — no `dir` attribute

**File:** `index.html` line 2

```html
<html lang="en" class="dark">
```

The `lang` and `dir` attributes are only updated once React mounts (via the Navbar `useEffect`). During the brief initial render, the document is always `lang="en"` with no `dir` attribute.

For Arabic users this means there could be a brief flash of LTR layout before the Navbar effect fires. The `Navbar` `useEffect` already handles this reactively. However, the `dir` attribute needs an initial value of `ltr` to be explicit.

**Fix:** Change `index.html` to `<html lang="en" dir="ltr" class="dark">` so the attribute exists from the start. The Navbar effect will override it immediately after hydration to match the detected language.

A more complete fix involves calling the `dir`/`lang` setter at i18n init time (before React renders), but that's more complex. The `dir="ltr"` default is sufficient since the Navbar effect fires within one React frame.

---

### Issue 3 — LOW: `LanguageSelector` uses a lookup that may not match when browser language is a regional code

**File:** `src/components/LanguageSelector.tsx` line 16

```typescript
const currentLang = languages.find(l => l.code === i18n.language) || languages[0];
```

The `navigator.language` API returns codes like `"hi-IN"`, `"ar-SA"`, `"zh-CN"`, `"pt-BR"`. The i18next `LanguageDetector` with `navigator` order resolves these to the base code (e.g., `"hi"`) using its built-in normalisation — so this works fine. However, the globe selector currently shows no label for the current language, only a `Globe` icon. Users can't tell which language is active without opening the dropdown.

**Fix:** Show the current language's `nativeName` as a small text label next to the Globe icon so users can see at a glance what language is active. This also helps users from regional locales confirm the app is in their language.

---

## Summary of Fixes Required

| # | File | Change | Priority |
|---|------|--------|----------|
| 1 | `src/components/AIWinShareCard.tsx` | Translate game name labels using `t()` + add `gameNames` keys to all 10 locale files | Medium |
| 2 | `index.html` | Add `dir="ltr"` to `<html>` tag | Low |
| 3 | `src/components/LanguageSelector.tsx` + `src/components/Navbar.tsx` | Show current language native name next to globe icon | Low |

## Implementation Plan

### 1. Add game name keys to all 10 locale files under `aiWinCard.gameNames`

```json
// en.json (existing aiWinCard block, add:)
"gameNames": {
  "chess": "Chess",
  "checkers": "Checkers",
  "backgammon": "Backgammon",
  "dominos": "Dominos",
  "ludo": "Ludo"
}
```

Native translations for all 10 languages:
- **hi**: शतरंज, चेकर्स, बैकगैमन, डोमिनोज़, लूडो
- **ar**: شطرنج, الداما, الطاولة, الدومينو, لودو
- **zh**: 国际象棋, 跳棋, 西洋双陆棋, 多米诺, 飞行棋
- **es**: Ajedrez, Damas, Backgammon, Dominó, Ludo
- **pt**: Xadrez, Damas, Gamão, Dominó, Ludo
- **fr**: Échecs, Dames, Backgammon, Dominos, Ludo
- **de**: Schach, Dame, Backgammon, Domino, Ludo
- **it**: Scacchi, Dama, Backgammon, Domino, Ludo
- **ja**: チェス, チェッカーズ, バックギャモン, ドミノ, すごろく

### 2. Update `AIWinShareCard.tsx` — replace static `GAME_LABELS`

Remove the hardcoded `GAME_LABELS` constant and use:
```typescript
const gameLabel = t(`aiWinCard.gameNames.${game}`, { defaultValue: game });
```

### 3. Update `index.html` — add `dir="ltr"`

```html
<html lang="en" dir="ltr" class="dark">
```

### 4. Update `LanguageSelector` — show current language name

Show a small `nativeName` abbreviation next to the globe icon in the navbar trigger button, so users can see at a glance which language is active:

```typescript
// Replace Globe-only trigger with:
<Globe size={16} />
<span className="text-xs font-medium">{currentLang.nativeName.slice(0, 2).toUpperCase()}</span>
```

Or show the first 2-3 characters of the native name as a compact code.

---

## Files to Change

| File | Change |
|------|--------|
| `index.html` | Add `dir="ltr"` to `<html>` |
| `src/components/AIWinShareCard.tsx` | Replace `GAME_LABELS` with `t(aiWinCard.gameNames.${game})` |
| `src/components/LanguageSelector.tsx` | Show active language nativeName next to Globe icon |
| `src/i18n/locales/en.json` | Add `aiWinCard.gameNames` block |
| `src/i18n/locales/hi.json` | Same in Hindi |
| `src/i18n/locales/ar.json` | Same in Arabic |
| `src/i18n/locales/zh.json` | Same in Chinese |
| `src/i18n/locales/es.json` | Same in Spanish |
| `src/i18n/locales/pt.json` | Same in Portuguese |
| `src/i18n/locales/fr.json` | Same in French |
| `src/i18n/locales/de.json` | Same in German |
| `src/i18n/locales/it.json` | Same in Italian |
| `src/i18n/locales/ja.json` | Same in Japanese |

No database changes. No edge function changes. No game logic changes.
