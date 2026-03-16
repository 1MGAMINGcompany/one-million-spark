

## Local Time Display for Prediction Events

### Changes

#### 1. New file: `src/lib/formatEventLocalDateTime.ts`

Small helper with two exports:

- **`formatEventDateTime(eventDate: string)`** → `"Mar 15, 2:00 PM EDT"` using `toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short" })`
- **`formatEventTime(eventDate: string)`** → `"2:00 PM EDT"` (time-only, for appending to countdowns)

#### 2. `src/components/predictions/EventSection.tsx`

- **Line 136**: Replace `new Date(event.event_date).toLocaleDateString()` with `formatEventDateTime(event.event_date)`
- **`formatCountdown` (lines 40-51)**: Update to accept an optional second parameter or modify the countdown display logic below. When countdown is under 24h, append local time: `"Starts in 5h 30m • 2:00 PM EDT"` using `formatEventTime`.

#### 3. `src/components/predictions/HomePredictionHighlights.tsx`

- **`formatDayLabel` (line 119)**: Replace `toLocaleDateString(...)` with `formatEventDateTime(dateStr)` for non-today/tomorrow dates. Today and Tomorrow labels remain unchanged but can also append time.

### Files

| File | Change |
|------|--------|
| `src/lib/formatEventLocalDateTime.ts` | New — two small formatter functions |
| `src/components/predictions/EventSection.tsx` | Use formatter for date display + enhance countdown with local time |
| `src/components/predictions/HomePredictionHighlights.tsx` | Use formatter in `formatDayLabel` |

No logic, schema, or dependency changes. Browser-native `Intl` only.

