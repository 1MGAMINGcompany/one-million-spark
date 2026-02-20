
# AI Win Share Card + Geolocation Language Auto-Detection

## Two Problems Being Solved

### Problem 1 — Language Detection Bug
The i18n config detects language in this order: `['localStorage', 'navigator', 'htmlTag']`. This means a user who visited once (getting English by default) will be permanently stuck on English because `localStorage` takes priority. New Indian visitors from Instagram arrive, get English cached, and never see Hindi.

**Fix**: Swap detection order to `['navigator', 'localStorage', 'htmlTag']`. This way:
- First-time visitors get their **browser/OS language automatically** (Hindi for Indian phones, Arabic for Gulf users, etc.)
- Users who manually pick a language via the selector still have that saved (localStorage write still happens — just read at lower priority)
- The `1m-gaming-language` localStorage key still works as a user override once set

This is a one-line fix in `src/i18n/index.ts` with zero functional side effects.

---

### Problem 2 — AI Win Share Card
Currently nothing happens when a user beats the AI — no celebration beyond the `GoldConfettiExplosion` already on some pages. We build a brand-new, self-contained `AIWinShareCard` component and wire it into all 5 AI game pages.

---

## New Component: `src/components/AIWinShareCard.tsx`

### Visual Design (Futuristic / Egyptian Cyber theme — matching the app)
```text
┌──────────────────────────────────────────────────────────┐
│  ▓▓▓ GOLD SCAN LINE ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  ← animated top bar
│                                                          │
│         [PYRAMID LOGO]     ← animated pulse glow         │
│                                                          │
│     ✦  VICTORY  ✦          ← gold gradient text          │
│    SKILL CONFIRMED          ← xs muted subtitle          │
│                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│   │  CHESS   │  │  HARD    │  │  00:42   │              │  ← Game | Difficulty | Duration
│   └──────────┘  └──────────┘  └──────────┘              │
│                                                          │
│   [LARGE GAME ICON — e.g. chess king ♔]                 │
│                                                          │
│   "I just beat the AI at Chess on Hard!"                 │  ← share copy
│                                                          │
│   ─────────────────────── SKILL > LUCK ─────────────── │
│                                                          │
│   [⬇ Save Image]  [𝕏 Share]  [💬 WhatsApp]  [📋 Copy]  │
└──────────────────────────────────────────────────────────┘
```

### Key Visual Features
- **Animated gold scan line** at the top — a moving gradient shimmer (`@keyframes scanline`)
- **Pyramid logo** with a pulsing glow ring
- **Three stat chips** (game type, difficulty, duration played) with cyber-border styling
- **Game icon** from the existing `GameIcons.tsx` components (big, centred)
- **Background**: Dark (`hsl(222,47%,6%)`) with subtle gold grid lines (same as game page backgrounds)
- **Corner accent marks** (like in the status bar on ChessAI) in all 4 corners
- **☥ Ankh symbols** for Egyptian flair matching the game pages
- **"SKILL > LUCK"** footer text — already a brand tagline
- `GoldConfettiExplosion` active behind the modal when open

### Props Interface
```typescript
export interface AIWinShareCardProps {
  open: boolean;
  onClose: () => void;
  game: 'chess' | 'checkers' | 'backgammon' | 'dominos' | 'ludo';
  difficulty: 'easy' | 'medium' | 'hard';
  durationSeconds: number;   // from useAIGameTracker start time
}
```

### Share Actions
| Button | Action |
|--------|--------|
| Download Image | `html-to-image` → PNG (same as `ShareResultCard`) |
| Share on X | `twitter.com/intent/tweet` with translated copy |
| WhatsApp | `wa.me/?text=...` with translated copy |
| Copy | `navigator.clipboard.writeText()` |

**Share text** (translated via i18n):
- X: `"I just beat the AI at {{game}} ({{difficulty}}) on 1M GAMING! No wallet needed — free to play. {{link}}"`
- WhatsApp: `"Just defeated the AI on 1M GAMING! Play free: {{link}}"`

All share copy uses the `aiWinCard` i18n namespace (new keys).

### Language Awareness
The card renders in **the user's current language** automatically since it uses `useTranslation()` — which will now resolve correctly thanks to the language detection fix.

---

## Integration into All 5 AI Pages

Each page already has `useAIGameTracker` returning `{ recordWin, recordLoss }`. We add:

1. A `showShareCard` state: `const [showShareCard, setShowShareCard] = useState(false)`
2. A `gameDuration` state (populated when win fires)
3. Wrap `recordWin()` in a new `handleWin()` that also sets `showShareCard = true`
4. Render `<AIWinShareCard open={showShareCard} onClose={() => setShowShareCard(false)} game="chess" difficulty={difficulty} durationSeconds={gameDuration} />`

**Duration** is already tracked inside `useAIGameTracker` — we expose it via a new `getDurationSeconds()` utility from the hook, or simply track `startTime` in the page via `useRef(Date.now())`.

To keep it clean, we add one extra export from `useAIGameTracker`:
```typescript
export function useAIGameTracker(game, difficulty) {
  // ... existing code ...
  const getDuration = useCallback(() =>
    Math.round((Date.now() - startTime.current) / 1000), []);
  return { recordWin, recordLoss, getDuration };
}
```

---

## New i18n Keys (`aiWinCard` namespace) — All 10 Locales

```json
"aiWinCard": {
  "victory": "VICTORY",
  "skillConfirmed": "SKILL CONFIRMED",
  "youBeatAI": "You beat the AI",
  "difficulty": "Difficulty",
  "timePlayed": "Time",
  "shareTitle": "Share Your Win",
  "downloadImage": "Save Image",
  "generating": "Generating...",
  "shareOnX": "Share on X",
  "whatsapp": "WhatsApp",
  "copy": "Copy",
  "copied": "Copied!",
  "xText": "Just beat the AI at {{game}} on {{difficulty}} difficulty! Free to play — no wallet needed.\n🎮 {{link}}",
  "waText": "I just beat the AI on 1M GAMING! Play free: {{link}}",
  "close": "Close",
  "playAgain": "Play Again",
  "tagline": "SKILL > LUCK"
}
```

These 14 keys get native translations in all 10 locale files.

---

## Files Changed

| File | Change |
|------|--------|
| `src/i18n/index.ts` | Swap detection order to `['navigator', 'localStorage', 'htmlTag']` |
| `src/components/AIWinShareCard.tsx` | New component (share card modal) |
| `src/hooks/useAIGameTracker.ts` | Add `getDuration()` export |
| `src/pages/ChessAI.tsx` | Add `showShareCard` state, render `<AIWinShareCard>` on win |
| `src/pages/CheckersAI.tsx` | Same |
| `src/pages/BackgammonAI.tsx` | Same |
| `src/pages/DominosAI.tsx` | Same |
| `src/pages/LudoAI.tsx` | Same |
| `src/i18n/locales/en.json` | 14 new keys under `aiWinCard` |
| `src/i18n/locales/hi.json` | Same in Hindi |
| `src/i18n/locales/ar.json` | Same in Arabic |
| `src/i18n/locales/zh.json` | Same in Chinese |
| `src/i18n/locales/es.json` | Same in Spanish |
| `src/i18n/locales/pt.json` | Same in Portuguese |
| `src/i18n/locales/fr.json` | Same in French |
| `src/i18n/locales/de.json` | Same in German |
| `src/i18n/locales/it.json` | Same in Italian |
| `src/i18n/locales/ja.json` | Same in Japanese |

**No database changes. No wallet/Solana changes. No edge function changes.**

## Risk

- Zero risk on language detection fix — users who manually selected a language previously will keep that setting; only first-time visitors change behaviour
- The share card is purely additive — no game logic touched, only a modal rendered on win
- `html-to-image` is already installed and used by `ShareResultCard`
