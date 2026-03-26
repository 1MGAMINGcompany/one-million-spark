

# Geo-Block Screen — Dismissible Banner with VPN Hint

## What We Are Building

A dismissible geo-block notification that appears when a user is detected in a restricted region. The user can close it and continue browsing predictions in read-only mode. Includes a supported regions list, waitlist signup, and a legal VPN suggestion.

## Changes

### 1. New component: `src/components/predictions/GeoBlockScreen.tsx`
- **Dismissible card** (not a blocking overlay) — user can close via X button
- Title: "Service Not Available in Your Region"
- Message: "We're not yet available in your location due to local regulations."
- Supported regions displayed as badges: US (most states), UK, EU, Canada, Australia, Japan, Brazil
- "Join Waitlist" button with email input — saves to `geo_waitlist` table
- VPN notice (legally framed): "Many users access global services using a VPN. Using a VPN to access this service is your personal choice and responsibility." — small muted text, not a direct instruction
- "Explore Predictions" button that dismisses the banner and enables read-only mode

### 2. Database migration: `geo_waitlist` table
```sql
CREATE TABLE public.geo_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  wallet text,
  detected_region text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.geo_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join waitlist" ON public.geo_waitlist FOR INSERT WITH CHECK (true);
```

### 3. Update `src/pages/FightPredictions.tsx`
- Add `geoBlocked` and `geoBlockDismissed` state variables
- In the error handler (around line 456), detect geo-block: if `error_code === "geo_blocked"` or message contains "region" or "restricted"
- When `geoBlocked && !geoBlockDismissed`: render `GeoBlockScreen` at top of page
- When dismissed: set `geoBlockDismissed = true`, set `readOnly = true`
- Pass `readOnly` prop to `EventSection` → `FightCard`

### 4. Update `src/components/predictions/FightCard.tsx`
- Accept optional `readOnly?: boolean` prop
- When `readOnly`, disable all predict/bet buttons with tooltip "Not available in your region"
- All fight data (odds, pools, fighters) still visible

### 5. Update `src/components/predictions/EventSection.tsx`
- Pass through `readOnly` prop to `FightCard`

## Files
- `src/components/predictions/GeoBlockScreen.tsx` — **new**
- `src/pages/FightPredictions.tsx` — geo-block state + error detection
- `src/components/predictions/FightCard.tsx` — readOnly prop
- `src/components/predictions/EventSection.tsx` — pass readOnly
- Database migration — `geo_waitlist` table

