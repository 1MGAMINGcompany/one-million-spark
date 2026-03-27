


# Improve Admin Intake: Proper Gamma API Integration — IMPLEMENTED

## Changes Made

### 1. Edge Function (`supabase/functions/polymarket-sync/index.ts`)
- Added `fetchAllActiveEvents()` — paginated `GET /events?active=true&closed=false&order=startDate&ascending=true`
- Added `fetchSports()` — `GET /sports` for dynamic sport/tag discovery
- Added `discover_sports` action — returns full sport metadata from Gamma
- Added `browse_all` action — returns ALL active events with pagination (`offset`/`limit`), sorted chronologically
- Improved `fetchEventsByTagId` — added `&order=startDate&ascending=true` for chronological results

### 2. Admin UI (`src/pages/FightPredictionAdmin.tsx`)
- Added "🌐 Browse All" tab — loads all active Polymarket events with "Load More" pagination
- Added "🏟️ Discover Sports" tab — fetches and displays all sports metadata with tag IDs
- Both tabs integrated into existing PolymarketSyncPanel with shared import/selection flow
