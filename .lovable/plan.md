

# Rebrand Share Card for 1mg.live / Operator Apps

## Problem
The `SocialShareModal` always shows 1mgaming.com branding:
- The "WHO WINS?" fighter banner image (`who-wins-banner.jpeg`)
- The gold pyramid logo (`1m-pyramid-logo-hd.png`) as fallback
- Gold accent colors from 1mgaming.com theme
- Tagline references "BKFC · Muay Thai · MMA · Futbol"

When an operator app user on 1mg.live shares a pick, the card should show **their operator's branding** or fall back to the **1mg.live "BE THE BOOKIE..."** identity with blue accent colors.

## What Changes

### File: `src/components/SocialShareModal.tsx`

**1. Copy the uploaded 1mg.live logo into the project**
- Copy `user-uploads://1mg-behtebookie.png` to `public/images/1mg-bethebookie.png`

**2. Domain-aware banner and fallback logo**
- Import `detectDomain` from `@/lib/domainDetection`
- When domain is `platform` or `operator`:
  - **Remove** the "WHO WINS?" fighter banner entirely — replace with a clean header using the operator's logo (large, centered) or the 1mg.live logo
  - Set `brandLogo` fallback to `/images/1mg-bethebookie.png` instead of the pyramid
  - Set `brandName` fallback to `"1MG.live"` instead of `"1MGAMING"`
- When domain is `flagship`: keep current behavior unchanged

**3. Color adaptation for platform/operator context**
- The card border currently uses `border-primary/30` which inherits gold on 1mgaming.com but should be blue on 1mg.live — this already works via CSS variables, no change needed
- The result badge (`MY PICK`) uses `bg-primary/90` — also inherits correctly from theme

**4. Tagline text for platform/operator**
- Change "Fight Predictions (BKFC · Muay Thai · MMA · Futbol)" to "Sports Predictions · Players vs Players · Winners take the pot" when on platform/operator domain
- Update `buildCaption()` similarly for X/WhatsApp/Telegram share text

**5. Share URL already correct**
- `buildShareUrl` already returns `https://1mg.live/{subdomain}` for operator apps — no change needed

## What Does NOT Change
- 1mgaming.com flagship share card — completely untouched
- Share button logic, analytics logging, download/copy functions
- Operator logo passthrough from `OperatorApp.tsx` — already works
- Settlement, payouts, auth — untouched

## Expected Result
- Operator with logo: card shows their logo prominently, clean header (no fighter banner)
- Operator without logo: card shows the 1mg.live "BE THE BOOKIE..." logo
- 1mgaming.com: unchanged gold pyramid + WHO WINS? banner

