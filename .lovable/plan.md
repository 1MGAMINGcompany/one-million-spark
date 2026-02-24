
# Upgrade Share Result Card to Premium Quality

## Overview
Redesign the ranked game share card (`ShareResultCard`) to be a luxurious, high-quality card that players will be proud to share. Also wire up the player's lifetime stats (total SOL won, total games won) so they actually appear on the card.

## Current Issues
- The card uses basic styling -- flat colors, simple layout
- `totalGamesWon` and `totalSolWon` props exist but are never passed from `GameEndScreen`
- No game-specific icon on the card
- Missing the premium "1M Gaming" branding feel from the logo reference

## Changes

### 1. GameEndScreen -- Fetch and pass player stats
**File: `src/components/GameEndScreen.tsx`**

- On mount, query the `player_profiles` table for the current player's wallet to get `wins` and `total_sol_won`
- Pass these values as `totalGamesWon` and `totalSolWon` to `ShareResultCard`

### 2. ShareResultCard -- Premium redesign
**File: `src/components/ShareResultCard.tsx`**

Visual upgrades:
- Add the PyramidLogo component at the top with a floating/pulsing glow animation
- Add golden gradient header bar with "1M GAMING" branding text
- Corner accent marks (like the AI card) for a luxurious framed feel
- Animated scan line at the top edge
- Grid background pattern with subtle gold lines
- Larger, bolder victory/loss text with gradient gold styling
- Game-specific icon from GameIcons (Chess, Checkers, etc.)
- Ankh dividers between sections
- Stats displayed in premium bordered chips with gold accents
- SOL amounts shown prominently with a Solana-style accent
- "SKILL > LUCK" tagline with golden gradient
- www.1mgaming.com watermark at the bottom
- Better dark/light theme contrast

New customization toggles (keeping existing ones):
- All existing toggles remain (wallet, full address, SOL amount, total games, total SOL, opponent, timestamp, dark theme)
- Total Games Won and Total SOL Won toggles now default to ON (since data will be available)

Export improvements:
- Card renders at 1080x1080 for crisp social media sharing
- Keep all existing share buttons (X, WhatsApp, Email, Copy)

### 3. No database changes needed
The `player_profiles` table already has all required fields (`wins`, `total_sol_won`).

### Summary of files changed
| File | Change |
|------|--------|
| `src/components/GameEndScreen.tsx` | Fetch player stats, pass to ShareResultCard |
| `src/components/ShareResultCard.tsx` | Premium visual redesign with animations, icons, branding |
