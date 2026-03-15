

## Problem

The `parseSport()` function only recognizes "MLS", "SOCCER", "FUTBOL", "UFC", "MMA", "BOXING", and "MUAY THAI" keywords. Soccer events from API-Football use league names like "Premier League", "La Liga", "Serie A" — none of which match. These events fall through to the default branch which returns the first part of the event name, failing to match `SPORT_CONFIG["FUTBOL"]` and defaulting to the Muay Thai icon. They also won't appear under the FUTBOL sport tab.

## Plan

### 1. Update `parseSport()` — add soccer league keywords + `source_provider` fallback

In `src/components/predictions/EventSection.tsx`:

- Add a second optional parameter: `sourceProvider?: string | null`
- If `sourceProvider === "api-football"`, return `"FUTBOL"` immediately
- Add keyword matches for major leagues: `PREMIER LEAGUE`, `LA LIGA`, `CHAMPIONS LEAGUE`, `SERIE A`, `BUNDESLIGA`, `LIGUE 1`, `EREDIVISIE`, `LIGA MX`, `EPL`, `COPA`, `EURO`, `FIFA`, `WORLD CUP`
- This ensures all soccer events map to `"FUTBOL"` regardless of naming

### 2. Add `source_provider` to the public `PredictionEvent` interface

In both `EventSection.tsx` and `FightPredictions.tsx`, add `source_provider?: string | null` to the `PredictionEvent` interface so it's available for sport detection.

### 3. Pass `source_provider` through sport detection calls

In `FightPredictions.tsx`:
- The events query already uses `select("*")` which includes `source_provider` — no query change needed
- Update the `parseSport()` calls at lines 176 and 184 to pass the event's `source_provider`
- Update `EventSection` to pass `event?.source_provider` into `parseSport()`

### 4. Update `HomePredictionHighlights.tsx`

- Add `source_provider` to its `PredictionEvent` type
- Pass `source_provider` into `parseSport()` during fight enrichment so the FUTBOL tab and soccer icon work correctly in the homepage highlights

### 5. Update `sportLabels.ts`

- Update `getItemLabelFromEvent` to accept and forward `sourceProvider`

No backend, wallet, claim, or settlement logic is touched.

