

# Event-Based Prediction System with Category Tabs

## Problem
All 12 fights are currently displayed in a flat grid with no event grouping. As more events (boxing, UFC, etc.) are added, this becomes unusable.

## Plan

### 1. Update database: rename event_name for Silvertooth fights
- Update all `prediction_fights` where `event_name` starts with "Silvertooth" to use `"MUAY THAI — Silvertooth Fight Night — March 14"`
- The Road to Tulum fights get: `"MUAY THAI — Silvertooth Fight Night — Road to Tulum — March 14"`
- This embeds the sport category in the event_name for easy parsing

### 2. Redesign FightPredictions page with event categories
Replace the flat grid with a structured, engaging layout:

**Hero section** — Keep existing but refine copy: "Prediction Markets" with subtitle "Pick your fighter. Earn rewards."

**Sport category tabs** — Horizontal scrollable pill tabs at the top:
- ALL (default)
- MUAY THAI (active, since it's the only sport now)
- BOXING (coming soon badge)
- MMA (coming soon badge)
- UFC (coming soon badge)

**Event cards** — Each event is a collapsible section:
```text
┌─────────────────────────────────────────┐
│ 🥊 MUAY THAI — Silvertooth Fight Night  │
│ 📅 March 14  •  📍 Montreal, QC  •  PPV │
│ 12 Fights  •  Total Pool: X.XX SOL      │
│ [▼ Expand]                               │
├─────────────────────────────────────────┤
│ Main Event  │  Fight 11  │  Fight 10... │
│ (fight cards inside)                     │
└─────────────────────────────────────────┘
```

**Fight ordering within events:**
- Main Event first, then descending fight number (11, 10, 9...), tournament fights last
- "Road to Tulum Tournament" gets its own sub-section header within the event

**"Coming Soon" placeholder cards** for Boxing/UFC/MMA — teaser cards with "Notify Me" text to build hype

### 3. Event header card component
New `EventHeader` component showing:
- Sport icon (glove for Muay Thai, etc.)
- Event name + date + location
- Total pool across all fights in that event
- Fight count + open/locked status summary
- Collapsible — defaults to expanded for events with open fights

### 4. Visual enhancements for engagement
- Sport-specific accent colors (Muay Thai = red/gold, Boxing = blue, MMA = green)
- Animated pool counter that ticks up on realtime updates
- Pulsing "LIVE" badge on events with open predictions
- "🔥 Hot" badge on fights with the largest pools
- Sort fights by pool size option ("Hottest First" toggle)

### 5. Implementation details

**Data flow:**
- Group fights by `event_name` on the client after fetching
- Parse event_name format: `"SPORT — Event Name — Date"` or `"SPORT — Event Name — Sub-event — Date"`
- Sport category filter just filters the grouped events

**Files changed:**
- `src/pages/FightPredictions.tsx` — Major refactor: add tabs, event grouping, event headers, coming soon cards
- Database update (via insert tool): rename event_name on existing fights

**No schema changes needed** — `event_name` text field is flexible enough to carry sport + event + date info.

### 6. Future-proof structure
When adding a new event (e.g., "BOXING — Golden Gloves — April 5"), the admin just creates fights with that event_name. The UI automatically:
- Adds "BOXING" to the sport tabs
- Groups all fights under the event header
- Shows them in the correct category

