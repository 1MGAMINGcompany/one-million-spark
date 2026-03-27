

# Fix: Soccer Events — Category, Display Names, and Logos

## Problems (confirmed by DB query and screenshots)

1. **Category is NULL** — "South Africa vs. Panama" was imported before the FUTBOL categorization fix deployed, so it shows with boxing gloves icon instead of soccer ball
2. **"Panama vs Not Panama"** — Polymarket soccer markets are binary Yes/No per team (e.g., "Will Panama win?"). `resolveOutcomeName` maps "Yes" → "Panama", "No" → "Not Panama", which is confusing. The card should show the team name as header and "Yes" / "No" as the prediction buttons
3. **No team logos/flags** — `home_logo` and `away_logo` are null because nothing fetches them during Polymarket import

## Database State (confirmed)
```
event_name: "South Africa vs. Panama"
category: NULL                          ← should be "FUTBOL"
fighter_a_name: "Yes"                   ← raw Polymarket outcome
fighter_b_name: "No"
title: "Panama" / "South Africa" / "Draw (South Africa vs. Panama)"
```

## Changes

### 1. Backfill existing NULL-category Polymarket soccer events (DB migration)
Run a one-time UPDATE to set `category = 'FUTBOL'` on `prediction_events` where `source_provider = 'polymarket'` and event_name matches known soccer patterns (contains "vs.") and is linked to FIFA/soccer leagues. This fixes the icon immediately.

### 2. Fix `resolveOutcomeName` for soccer binary markets (`src/lib/resolveOutcomeName.ts`)
For soccer Yes/No markets where the title IS a team name:
- Side "a" (Yes) → show the team name (e.g., "Panama")
- Side "b" (No) → show "No" instead of "Not Panama"

This makes cards read: **"Panama: Yes vs No"** with proper predict buttons, matching how Polymarket actually structures them.

### 3. Fix `buildQuestion` for soccer Yes/No markets (`src/components/predictions/FightCard.tsx`)
Change the question from "Who wins: Panama vs Not Panama?" to use the Polymarket question directly (e.g., "Will Panama win on 2026-03-31?") since `polymarket_question` is already stored. Fall back to "Will {title} win?" for soccer binary markets.

### 4. Fix SoccerTeamColumn display for Yes/No markets (`src/components/predictions/FightCard.tsx`)
For Polymarket soccer binary markets (fighter_a_name = "Yes"), show:
- Team name from `fight.title` as the header
- "Yes" and "No" as the two prediction labels under the team
- Use the ⚽ fallback icon (already works when `home_logo`/`away_logo` are null)

### 5. Add country flag fetching during import (`supabase/functions/polymarket-sync/index.ts`)
For soccer events, after importing markets, attempt to resolve country/team flags:
- Parse team names from `gEvent.title` (e.g., "South Africa vs. Panama")
- Use a flag CDN (e.g., `flagcdn.com` or `countryflagsapi.netlify.app`) to set `home_logo` and `away_logo` on the prediction_events record
- Each fight card can then inherit the logo from the parent event

### Files Changed
- `supabase/functions/polymarket-sync/index.ts` — flag fetching on soccer import
- `src/lib/resolveOutcomeName.ts` — fix "Not {team}" to show "No" for soccer binary markets
- `src/components/predictions/FightCard.tsx` — use polymarket_question for soccer cards, adapt SoccerTeamColumn for Yes/No structure
- DB migration — backfill `category = 'FUTBOL'` for existing soccer events

