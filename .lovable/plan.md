

# Improve Admin Intake: Proper Gamma API Integration

## Current State
The admin sync already works (48 FIFA Friendlies, 13 MMA visible). The tag-based fetching uses `GET /events?tag_id=...&active=true&closed=false` correctly. However, tag IDs are hardcoded and there's no way to discover new sports/tags dynamically.

## Changes

### 1. Add `GET /sports` discovery endpoint (`polymarket-sync/index.ts`)
Add a new action `discover_sports` that calls `GET https://gamma-api.polymarket.com/sports` and returns the full sport metadata (sport name, tag IDs, images, series info). This lets the admin UI dynamically show available sports instead of relying on hardcoded tag IDs.

### 2. Add `browse_all` action using `GET /events` as main feed
Add a new action `browse_all` that fetches `GET /events?active=true&closed=false&limit=100&order=startDate&ascending=true` with pagination support (`offset` param). This gives admins a single chronological view of ALL upcoming Polymarket events across all sports, sorted by start date.

### 3. Update admin UI (`FightPredictionAdmin.tsx`)
- Add a "Browse All Upcoming" button that calls the `browse_all` action with pagination
- Add a "Discover Sports" button that calls `discover_sports` to show all available Polymarket sports and their tag IDs (useful for adding new leagues)
- Add pagination controls (Load More) for large result sets

### 4. Improve `fetchEventsByTagId` with sorting
Update the tag-based fetch to include `&order=startDate&ascending=true` so results come back chronologically (soonest first).

### Files Changed
- `supabase/functions/polymarket-sync/index.ts` — add `discover_sports` action, `browse_all` action, improve event sorting
- `src/pages/FightPredictionAdmin.tsx` — add Browse All and Discover Sports UI buttons

