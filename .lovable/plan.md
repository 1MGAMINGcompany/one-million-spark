

# Fix: Admin Browse Filters Rejecting All Polymarket Events

## Problem (confirmed by screenshot)
The PGA search returns 20 raw Polymarket results but **0 after filters**. Two filters are killing everything:

1. **Date filter** (`isDateEligible`): Cutoff is set to "tomorrow 00:00 UTC" — rejects today's games and any event with a past `startDate` (e.g., season-long markets like "2025 PGA Champion" with `startDate: 2025-03-03`)
2. **Closed filter** (line 422): Rejects any event where `closed === true` on the parent event — but many Polymarket events mark the parent as `closed` while individual sub-markets remain active and tradeable

## Solution

### File: `supabase/functions/polymarket-sync/index.ts`

**1. Add `skipFilters` parameter to the filter function (~line 385)**

The filter function gets an optional `skipFilters: boolean` flag. When `true` (admin browse/search/preview modes), skip the date check and the `closed` check — only keep the matchup/fixture pattern check and the futures regex.

**2. Relax `isDateEligible` for auto-sync too**

Change the cutoff from "tomorrow 00:00 UTC" to "2 hours ago" so today's games pass through even in non-admin flows.

**3. For admin modes, skip `closed` check**

When browsing, an event with `closed: true` on the parent can still have active sub-markets. Admin should see these and decide manually.

**4. Update all admin call sites**

Pass `skipFilters: true` from `browse_league`, `url_preview`, `search`, and `browse_all` action handlers so admins see all available events.

### Changes Summary

```text
filterEvents(events)                    → filterEvents(events, { adminMode: true })
                                           ↑ skips date + closed checks

isDateEligible cutoff:
  Before: tomorrow 00:00 UTC
  After:  now - 2 hours (for auto-sync safety net)

Admin browse/search/preview:
  Skip date filter entirely
  Skip closed===true filter
  Keep: futures regex, matchup pattern check
```

### Single file changed
- `supabase/functions/polymarket-sync/index.ts`

