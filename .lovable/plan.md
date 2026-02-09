

# Add Comprehensive Game Rules to the Rules Page (All 10 Languages)

## Overview

The current Game Rules page only shows basic game-specific rules (piece movement, board setup). Your detailed rules document covers much more: turn timers, missed turns/forfeits, disconnection behavior, settlement, no-show protection, and fair play guarantees. All of this needs to be added to the page and translated into all 10 languages.

## Compliance Audit

Before adding content, here is a quick check of whether the app actually follows these rules:

| Rule | Status | Notes |
|------|--------|-------|
| Chess/Checkers/Dominos: auto-flip turn after move | OK | `submit_game_move` RPC handles this |
| Backgammon: multi-action turn (dice + moves + turn_end) | OK | Backend skips auto-flip for game type 3 |
| Ludo: elimination after 3 strikes | OK | Backend handles elimination logic |
| Server-anchored turn timer | OK | Just fixed -- `useTurnTimer` uses `turnStartedAt` from DB |
| 3 missed turns = auto-forfeit/elimination | OK | `maybe_apply_turn_timeout` RPC handles this |
| Auto-settlement on game end | OK | `useAutoSettlement` fires automatically; "Settle" button now hidden during settlement |
| No-show / waiting timeout + refund | OK | `forfeit-game` edge function handles cancel flow with refund |
| Shareable match results | OK | `match_share_cards` table populated on settlement |

**No code logic fixes needed.** Everything matches your spec.

## What Changes

### 1. Restructure the GameRules page (`src/pages/GameRules.tsx`)

The current page has one accordion with 5 game-specific sections. The new page will have:

- **Section 1: General Rules** (timers, missed turns, disconnects) -- always visible at top
- **Section 2: Game-Specific Rules** (accordion, same as today but updated content)
  - Chess, Checkers, Dominos (grouped -- same turn model)
  - Backgammon (multi-action turns)
  - Ludo (multiplayer elimination)
- **Section 3: No-Show Protection** (waiting timeout, refund)
- **Section 4: Winnings & Settlement** (auto-settlement, sharing)
- **Section 5: Fair Play Guarantee** (server-enforced, no stalling)

Each section uses translated i18n keys. No hardcoded English.

### 2. Add new i18n keys to all 10 locale files

New namespace: `gameRulesDetailed` with keys for every section, heading, and bullet point from your document. This keeps the existing `gameRules` namespace intact (no breaking changes).

Approximately 60-70 new keys per language file, covering:
- `generalRules.title`, `generalRules.turnTimers`, `generalRules.timerDesc`, etc.
- `chessCheckersRules.title`, `chessCheckersRules.turnFlow`, etc.
- `backgammonRules.title`, `backgammonRules.turnFlow`, etc.
- `ludoRules.title`, `ludoRules.turnFlow`, etc.
- `noShowProtection.title`, `noShowProtection.desc`, etc.
- `settlement.title`, `settlement.desc`, etc.
- `fairPlay.title`, `fairPlay.guarantee`, etc.

### 3. Files to modify

| File | Change |
|------|--------|
| `src/pages/GameRules.tsx` | Rebuild with sections for general rules, per-game rules, settlement, fair play |
| `src/i18n/locales/en.json` | Add `gameRulesDetailed` namespace (~65 keys) |
| `src/i18n/locales/es.json` | Add Spanish translations |
| `src/i18n/locales/pt.json` | Add Portuguese translations |
| `src/i18n/locales/fr.json` | Add French translations |
| `src/i18n/locales/de.json` | Add German translations |
| `src/i18n/locales/ar.json` | Add Arabic translations |
| `src/i18n/locales/zh.json` | Add Chinese translations |
| `src/i18n/locales/it.json` | Add Italian translations |
| `src/i18n/locales/ja.json` | Add Japanese translations |
| `src/i18n/locales/hi.json` | Add Hindi translations |

### 4. No breaking changes

- Existing `gameRules` keys remain untouched
- No database changes
- No backend changes
- No game logic changes
- Only the GameRules page UI and i18n files are modified

