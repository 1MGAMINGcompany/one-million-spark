
# Add "Compete for SOL" Sub-Labels to Hero CTAs & Game Cards

## Goal
New users see "Create Game Room" and "View Public Rooms" but have no idea those involve real Solana coin. We add small, plain-language sub-labels directly under the button text so the value proposition is immediately obvious — without using any gambling language.

## Compliant Phrasing Strategy
Following the platform's "Grandma Test" UX memory and legal positioning:

| What to say | Why it's compliant |
|---|---|
| "Compete for SOL" | Skill/competition framing, same as a chess tournament |
| "Entry fee in SOL" | Factual, transactional — no "wager" or "bet" |
| "Skill-based · SOL prizes" | Echoes the legal disclaimer already on the homepage |
| "Play & win SOL" | Outcome is skill, not chance |

We never use: "bet", "wager", "gamble", "win money", "luck", "jackpot"

---

## Changes

### 1. Home page hero buttons — `src/pages/Home.tsx`

The two outline buttons ("Create Game Room" / "View Public Rooms") get restructured to support a two-line label. The `<Button>` will switch from `h-14` to `h-auto py-3` to accommodate the extra line.

**Before:**
```
┌─────────────────────┐
│ ⚔  Create Game Room │
└─────────────────────┘
```

**After:**
```
┌──────────────────────────────┐
│ ⚔  Create Game Room          │
│    Compete for SOL · Skill   │  ← xs muted gold text
└──────────────────────────────┘
```

Each button `<Link>` content becomes a `flex-col items-start` with the main label on line 1 and a `<span className="text-xs text-primary/60 font-normal tracking-wide">` on line 2.

The Quick Match gold button also gets a sub-label ("Random stake · SOL prize pool") using the same approach but with `text-background/70` for contrast on the gold background.

The "Play vs AI (Free)" button already says "Free" — no change needed.

### 2. Featured Game Cards — `src/components/FeaturedGameCard.tsx`

The "Play Now" button inside each card changes to show two lines:

**Before:**
```
[ ▲  Play Now ]
```

**After:**
```
[ ▲  Play for SOL      ]
[    Skill-based match  ]
```

Implementation: The button body's inner `<div>` switches from `flex-row items-center` to `flex-col items-center gap-0.5`. The sub-label is a small `<span className="text-xs text-background/70 font-normal">`.

### 3. Room List page Create button — `src/pages/RoomList.tsx`

The compact header "Create Room" button gets a `title` tooltip upgrade (already has one for disabled state) and a small badge below it: `Compete for SOL`. Since the button is `size="default"` (not icon), we can wrap the button content the same way with a short two-liner.

### 4. New i18n keys — all 10 locale files

5 new keys added under the `home` namespace in `en.json` and all 9 other locales (`ar`, `de`, `es`, `fr`, `hi`, `it`, `ja`, `pt`, `zh`):

```json
"home": {
  ...existing keys...,
  "createRoomSub": "Compete for SOL · Skill-based",
  "viewRoomsSub": "Entry fee in SOL · Skill-based",
  "quickMatchSub": "Random stake · SOL prize pool",
  "playForSol": "Play for SOL",
  "skillBasedMatch": "Skill-based match"
}
```

Each locale gets a natural translation of the same concept (not word-for-word, but meaning-preserving).

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/Home.tsx` | Restructure 3 button labels to 2-line with sub-label spans |
| `src/components/FeaturedGameCard.tsx` | Update "Play Now" → "Play for SOL" + sub-label |
| `src/pages/RoomList.tsx` | Add sub-label to the "Create Room" header button |
| `src/i18n/locales/en.json` | 5 new keys under `home` |
| `src/i18n/locales/es.json` | Same 5 keys in Spanish |
| `src/i18n/locales/pt.json` | Same 5 keys in Portuguese |
| `src/i18n/locales/fr.json` | Same 5 keys in French |
| `src/i18n/locales/de.json` | Same 5 keys in German |
| `src/i18n/locales/ar.json` | Same 5 keys in Arabic |
| `src/i18n/locales/zh.json` | Same 5 keys in Chinese |
| `src/i18n/locales/it.json` | Same 5 keys in Italian |
| `src/i18n/locales/ja.json` | Same 5 keys in Japanese |
| `src/i18n/locales/hi.json` | Same 5 keys in Hindi |

No database, edge function, auth, or game logic changes.

## Risk Assessment
- Zero functional risk — purely additive UI text changes
- Legal safe: all phrasing follows the existing "skill-based competition" positioning
- Responsive safe: sub-labels are `text-xs` and truncate gracefully on narrow screens
