

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
- VPN notice (legally framed): "Many users access global services using a VPN. Using a VPN to access this service is your personal choice and responsibility." — small muted text, not a direct