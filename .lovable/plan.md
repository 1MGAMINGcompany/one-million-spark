

# My Predictions Tab + Shareable Prediction Cards

## What We Are Building

1. **"My Predictions" section on the Player Profile page** — A new tab/section showing all open and past predictions for the logged-in user, with fight name, pick, amount, status (open/won/lost), and claim state.

2. **Upgraded share card for predictions** — Replace the current `predictions-hero.jpeg` hero image in `SocialShareModal` with the uploaded "WHO WINS?" banner image. Update the share caption text to match the 1MGAMING branding from the third image: "WHO WINS? 👊 / Fight Predictions (BKFC · Muay Thai · MMA · Futbol) / Players vs Players / Winners take the pot / 👇 Make your pick / 🌐 1MGaming.com"

3. **Share button on PredictionSuccessScreen** — Already exists (`Share Pick`). Will ensure it is prominent and always visible (not gated behind feature flag check that could hide it).

## Plan

### 1. Copy the "WHO WINS?" banner image to assets
Copy `user-uploads://WhatsApp_Image_2026-03-26_at_4.33.45_PM.jpeg` to `src/assets/who-wins-banner.jpeg`. This replaces `predictions-hero.jpeg` as the share card hero.

### 2. Update `SocialShareModal.tsx` — new hero image + hype captions
- Replace `predictions-hero` import with the new `who-wins-banner` image
- Update `buildCaption()` for prediction variant to use the hype text:
  ```
  WHO WINS? 👊
  My pick: {fighterName} | ${amount}
  Fight Predictions (BKFC · Muay Thai · MMA · Futbol)
  Players vs Players • Winners take the pot
  👇 Make your pick
  🌐 1MGaming.com/predictions?ref={code}
  ```
- Update the card body to show "WHO WINS? 👊" as a bold header above the pick details

### 3. Add "My Predictions" section to `PlayerProfile.tsx`
- Fetch `prediction_entries` joined with `prediction_fights` for the profile wallet
- Show a new section after stats grid: "My Predictions"
- Each entry card shows: fight title, picked fighter, amount ($USD), status badge (Open/Won/Lost), claim status
- Won entries show reward amount in green
- Add a "Share" button on each prediction entry that opens `SocialShareModal` with variant="prediction"
- Only visible when viewing own profile (isOwnProfile) or when entries exist for any profile

### 4. Make profile shareable
- Add a "Share Profile" button at the top of the profile card that uses native share / copy link

## Files Changed
- `src/assets/who-wins-banner.jpeg` — new image (copied from upload)
- `src/components/SocialShareModal.tsx` — new hero image, updated captions and card layout
- `src/pages/PlayerProfile.tsx` — add My Predictions section with share buttons

## Technical Details
- Profile predictions query: `supabase.from("prediction_entries").select("*, prediction_fights(*)").eq("wallet", wallet).order("created_at", { ascending: false })`
- The `prediction_entries` table has: `fight_id`, `fighter_pick`, `amount_usd`, `claimed`, `reward_usd`, `shares`, `polymarket_status`
- The `prediction_fights` FK gives us: `title`, `fighter_a_name`, `fighter_b_name`, `status`, `winner`
- Status logic: fight.status === "settled" && fight.winner === entry.fighter_pick → "Won"; fight.status === "settled" && fight.winner !== entry.fighter_pick → "Lost"; else → "Open"

