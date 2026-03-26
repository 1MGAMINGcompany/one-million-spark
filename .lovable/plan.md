

# Replace Generic Emojis with HD Sport Images on 1mg.live

## Problem
The 1mg.live landing page uses generic emoji icons (🏈, 🏀, ⚽, 🥊, etc.) for floating background icons and the sports ticker. This looks cheap and not premium.

## Plan

### 1. Copy uploaded images to `src/assets/`
Copy all 7 uploaded images into `src/assets/`:
- `mmagloves-1mg.png` (MMA)
- `boxinggloves-1mg.png` (Boxing)
- `soccerball-1mg.png` (Soccer/Futbol)
- `basketball-1mg.png` (Basketball/NBA)
- `football-1mg.png` (Football/NFL)
- `hockeystick-1mg.png` (Hockey/NHL)
- `golfclub-1mg.png` (Golf)

### 2. Update `LandingPage.tsx` — Floating Icons
Replace the `FLOAT_ICONS` array (line 23-31) from emoji objects to image-based objects. Update `FloatingIcons` component to render `<img>` tags instead of emoji `<span>` tags, with the same floating animation but using the HD images (sized ~40-50px, with opacity and object-contain).

### 3. Update `LandingPage.tsx` — Sports Ticker
Replace the `TICKER_SPORTS` array (line 131-135) from emoji strings to image+label pairs. Update `SportsTicker` component to render small HD images (~20px) next to each sport name instead of emojis.

### 4. Update `ComingSoonCard.tsx` — Replace old MMA gloves image
Update the MMA entry in `ComingSoonCard.tsx` and `EventSection.tsx` to use the new `mmagloves-1mg.png` instead of the old `mma-gloves.png`. Also update boxing to use `boxinggloves-1mg.png` instead of `boxing-glove.png`.

## Files Changed
- `src/pages/platform/LandingPage.tsx` — floating icons + ticker use HD images
- `src/components/predictions/ComingSoonCard.tsx` — swap old sport images for new HD ones
- `src/components/predictions/EventSection.tsx` — swap old sport images for new HD ones
- 7 new image files copied to `src/assets/`

