

# ONE Friday Fights — Muay Thai Section Hub

## What Changes

When the user selects the **MUAY THAI** sport filter, a branded hub component renders at the top of the content area (before the status sections). No other sport filters are affected.

## New Component: `ONEFridayFightsHub.tsx`

A self-contained component placed in `src/components/predictions/` with:

### Section Header
- Title: "ONE Friday Fights" (Cinzel font, matching site style)
- Subtitle: "Live Every Friday Night from Bangkok"
- "Weekly Event" badge (styled like existing badges — small rounded pill)

### Countdown Timer
- Targets every Friday at 7:30 AM ET (11:30 UTC)
- Auto-resets weekly to next Friday
- Displays: Days / Hours / Minutes / Seconds in styled boxes (dark card bg, primary accent numbers)
- Tagline underneath: "Fast fights. Big moments. Every Friday."

### Live State
- If current time is between event time and event time + 4 hours:
  - Replace countdown with "LIVE NOW" banner
  - Pulsing red dot + red glow effect (matching existing live badge style)

### Info Card
- Card with fire emoji and educational text about weekly Muay Thai action, how prediction markets open when fight cards are confirmed

### Fight Card States (handled by existing system)
- When no Muay Thai events exist in the data → show 3-5 skeleton placeholder cards with "Fight card coming soon..." message
- When events exist → existing `EventSection` components render as normal
- Live state lockout already handled by existing `eventHasStarted` logic

## Changes to `FightPredictions.tsx`

- Import `ONEFridayFightsHub`
- Render it inside the content area, right before the status sections, **only when `activeSport === "MUAY THAI"`**
- When Muay Thai is selected and no events exist, show the hub with skeleton cards instead of the generic "No events" message

## Technical Details

- **Files created**: `src/components/predictions/ONEFridayFightsHub.tsx`
- **Files modified**: `src/pages/FightPredictions.tsx` (add conditional render)
- Countdown uses `useState` + `setInterval` (1s tick), computes next Friday 11:30 UTC
- Skeleton cards use existing `Skeleton` component from `src/components/ui/skeleton.tsx`
- All styling uses existing Tailwind classes and design tokens (bg-card, border-border, text-primary, font-['Cinzel'], etc.)
- No new dependencies
- No changes to other sport sections, wallet logic, or prediction system

