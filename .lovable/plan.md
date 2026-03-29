

## Plan: Fix Polymarket Browse Bug + Add Promo Codes & Back Button to Platform Admin

### Root Cause

Two parameter mismatches between `PlatformAdmin.tsx` and the `polymarket-sync` edge function:

1. **Body param name**: Frontend sends `league`, edge function expects `league_key` (line 1234)
2. **Response field**: Edge function returns `results`, frontend reads `data?.events`

Both cause every sport tab click to fail.

### Changes

**1. Fix `src/pages/platform/PlatformAdmin.tsx` — Polymarket browse call (line 187)**

Change the `handleBrowse` body from `{ action: "browse_league", wallet, league }` to `{ action: "browse_league", wallet, league_key: league }`.

Change the response reader from `data?.events` to `data?.results`.

**2. Add Promo Code Manager to the platform admin page**

Import and render `PromoCodeManager` in the platform admin page, between the events dashboard and the manual creator sections.

**3. Add "Back to Main Admin" button in the header**

Add a button/link in the header that navigates to `/predictions/admin` (the flagship admin page).

### Files Changed

1. `src/pages/platform/PlatformAdmin.tsx` — Fix browse params, add PromoCodeManager import + render, add back navigation button

