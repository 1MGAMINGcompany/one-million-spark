

# Strategy: Converting Visitors to Players

## Current Situation
- ~444 daily visitors (primarily from Instagram, India, mobile)
- 0 organic PvP games -- all 10 completed matches are from your 3 test wallets
- Free PvP mode exists but has never been used by a real visitor
- The homepage requires wallet connection before ANY gameplay

## Why Visitors Aren't Converting

The core problem is **friction before fun**. A visitor from Instagram lands on the homepage and sees:
1. "Quick Match" -- requires wallet login
2. "Play vs AI" -- works without login, but is buried as secondary CTA
3. "Create Room" / "View Rooms" -- requires wallet, confusing for newcomers

Similar successful platforms (Chess.com, Lichess, Backgammon Galaxy) all follow the same principle: **let users play within 5 seconds of landing, no signup required**.

## What Similar Apps Do

| Platform | First-visit experience | Monetization trigger |
|----------|----------------------|---------------------|
| Chess.com | Click "Play" -> instant game vs bot or random opponent, no account needed | After 3-5 games: "Create account to save progress" |
| Lichess | One click -> playing immediately, fully anonymous | Donation-based, no gate |
| Backgammon Galaxy | Guest play available instantly | "Login to play for coins" after first game |

**Common pattern**: Play first, register later. The "aha moment" happens during the first game, not during onboarding.

## Proposed Changes (3 steps, ordered by impact)

### Step 1: "Play Now" instant AI game from homepage (highest impact)

Add a prominent **"Play Now -- No Login Needed"** button that immediately starts a Backgammon/Chess AI game with zero friction. No wallet, no login, no selection screen.

- Replace the current hero CTA hierarchy: make "Play Now (Free)" the #1 button
- One tap -> navigates directly to `/play-ai/backgammon?difficulty=medium` (or rotates featured game)
- Current "Quick Match" and "Create Room" move to secondary position

### Step 2: Post-game conversion prompt

After the AI game ends (win or lose), show a tasteful prompt:

- "Enjoyed the game? Play against real opponents!"
- Two options: "Play Free vs Human" (no SOL needed) and "Play for SOL" (requires wallet)
- "Play Free vs Human" triggers the existing `free-match` edge function flow
- This is where login/wallet happens -- AFTER the user has experienced the product

### Step 3: Simplify the homepage for mobile visitors

Since traffic is primarily mobile from Instagram:
- Make the hero section shorter and more action-oriented
- Show a single large "Play Now" button above the fold
- Move the pyramid decoration and trust badges below the game cards
- Add social proof: "X games played today" using the existing LiveActivityIndicator

## Technical Details

### Step 1 implementation
- Modify `Home.tsx`: restructure CTA buttons to prioritize instant play
- Add a "featured game" rotation or default to the most popular game
- No backend changes needed -- AI games already work without authentication

### Step 2 implementation
- Create a new `PostGamePrompt` component shown in `GameEndScreen.tsx` (only for AI games)
- Add a "Play vs Human" button that navigates to `/quick-match` with the same game pre-selected
- For unauthenticated users clicking "Play for SOL", trigger the Privy login flow

### Step 3 implementation
- Adjust `Home.tsx` layout for mobile-first design
- Reduce hero section height on mobile
- Promote "Play Now" as the dominant CTA with larger tap target

## What This Does NOT Change
- No changes to the Solana program, settlement, or ranked logic
- No changes to the free-match edge function
- No changes to the wallet/funding flow (that stays for SOL players)
- No database migrations needed

## Expected Impact
The goal is to get a visitor from "landing" to "playing their first game" in under 10 seconds, with no registration. Once they've played and enjoyed a game, the conversion to free PvP (and eventually SOL matches) happens naturally through the post-game prompt.

