
# Match Brag Card with Promotional Logo and Banner

## What You'll Get
A shareable Match Card page at `/match/:roomPda` that displays:
- Your uploaded **banner** at the top (the backgammon/1M Gaming banner)
- Your uploaded **pyramid logo** as the branded logo on the card
- Match stats: game type, winner, SOL won, win reason
- A premium dark card design consistent with the 1M Gaming brand

When users share a match link on WhatsApp, X, or anywhere else, the recipient sees this branded card.

## Your Image Links (as .png-equivalent URLs)
After implementation, the images will be accessible at:
- **Logo**: `https://one-million-spark.lovable.app/images/1m-logo.jpeg`
- **Banner**: `https://one-million-spark.lovable.app/images/1m-banner-backgmmn.jpeg`

(Preview versions at `https://id-preview--d73f6b95-8220-42be-818d-0debaaad3e5a.lovable.app/images/1m-logo.jpeg` and same for banner)

## Files Changed

### 1. Copy images to `public/images/`
- `public/images/1m-logo.jpeg` -- the pyramid logo
- `public/images/1m-banner-backgmmn.jpeg` -- the banner

### 2. Create `src/pages/MatchShareCard.tsx` (new file)
The brag card page at `/match/:roomPda`:
- Fetches match data from the `match_share_cards` table using `roomPda`
- Layout:
  - **Banner** across the top (full width)
  - **Logo** centered below the banner
  - **"1M GAMING"** gold text branding
  - **Game type** badge (Chess, Backgammon, etc.)
  - **Winner wallet** (shortened)
  - **Brag stats only**: SOL Won, Win Reason (no losses shown per existing style rule)
  - **CTA button**: "Play Now" linking to homepage
- Handles loading and "match not found" states
- Dark background matching brand colors

### 3. Update `src/App.tsx`
- Import `MatchShareCard`
- Add route: `<Route path="/match/:roomPda" element={<MatchShareCard />} />`

### 4. Update `index.html` OG meta tags (optional enhancement)
- The `/match/:roomPda` page can set document title dynamically for basic SEO

## What the Card Will Look Like

The card layout (top to bottom):
1. Full-width banner image (the backgammon promotional banner)
2. Centered pyramid logo (smaller, ~80px)
3. "1M GAMING" gold gradient text
4. Game type pill (e.g., "CHESS" or "BACKGAMMON")
5. Trophy icon + "VICTORY" heading
6. Winner wallet address
7. Stats row: SOL Won | Win Reason
8. "Play Now on 1MGaming.com" button
9. Subtle footer: "Skill-Based Games on Solana"

## Technical Details

**MatchShareCard.tsx** key structure:
```typescript
// Fetch match data
const { data } = await supabase
  .from('match_share_cards')
  .select('*')
  .eq('room_pda', roomPda)
  .single();

// Display brag-worthy stats only (per project style rule)
// - SOL Won (winner_payout_lamports)
// - Win Reason (win_reason)
// - Game Type (game_type)
// No losses or total games shown
```

**Route addition in App.tsx:**
```typescript
import MatchShareCard from "./pages/MatchShareCard";
// ...
<Route path="/match/:roomPda" element={<MatchShareCard />} />
```

**Image references (from public/):**
```typescript
<img src="/images/1m-banner-backgmmn.jpeg" alt="1M Gaming" />
<img src="/images/1m-logo.jpeg" alt="1M Gaming Logo" />
```
