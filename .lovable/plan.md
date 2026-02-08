
# Share Win / Brag Link System - Full Implementation Plan

## Overview

Create an end-to-end sharing system for match results that generates branded, shareable cards with OG image previews for social media. Both winners ("Share Win") and losers ("Share Match") get share buttons after multiplayer games.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SHARE WIN / BRAG LINK FLOW                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  GAME END                     SHARE FLOW                    PUBLIC PAGE         │
│  ─────────                    ──────────                    ───────────         │
│                                                                                 │
│  ┌──────────────┐            ┌──────────────┐            ┌──────────────────┐  │
│  │ GameEndScreen│            │ ShareMatchBtn│            │ /match/:roomPda  │  │
│  │              │            │              │            │                  │  │
│  │ Winner: Win! │──click────▶│ • Copy link  │──share────▶│ Branded Card     │  │
│  │ [Share Win]  │            │ • WhatsApp   │            │ + Confetti       │  │
│  │              │            │ • Native     │            │ + OG Preview     │  │
│  │ Loser: Lost  │            │              │            │ + Play CTA       │  │
│  │ [Share Match]│            └──────────────┘            └──────────────────┘  │
│  └──────────────┘                                                               │
│                                                                                 │
│                                                                                 │
│  DATABASE                     EDGE FUNCTIONS              OG IMAGE              │
│  ────────                     ──────────────              ────────              │
│                                                                                 │
│  ┌──────────────┐            ┌──────────────┐            ┌──────────────────┐  │
│  │match_share_  │◀──upsert───│ forfeit-game │            │ match-og         │  │
│  │cards         │◀──upsert───│ settle-game  │            │                  │  │
│  │              │◀──upsert───│ settle-draw  │            │ Returns 1200x630 │  │
│  │ - room_pda   │            └──────────────┘            │ PNG with:        │  │
│  │ - winner     │                                         │ • Game icon      │  │
│  │ - stake      │            ┌──────────────┐            │ • Stake amount   │  │
│  │ - metadata   │◀──read─────│ match-get    │────────────│ • Winner         │  │
│  │ - ...        │            │              │            │ • 1M branding    │  │
│  └──────────────┘            └──────────────┘            └──────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Technical Implementation

### 1. Database Changes

The `match_share_cards` table already exists with the right columns:
- room_pda (PK)
- game_type, mode, stake_lamports
- winner_wallet, loser_wallet
- win_reason
- winner_rank_before/after, loser_rank_before/after (for ranked)
- tx_signature
- metadata (jsonb - for payout_direction, strikes, etc.)
- created_at, updated_at

**Migration needed**: Add missing columns for net payout calculations:

```sql
ALTER TABLE match_share_cards 
  ADD COLUMN IF NOT EXISTS winner_payout_lamports bigint,
  ADD COLUMN IF NOT EXISTS fee_lamports bigint,
  ADD COLUMN IF NOT EXISTS finished_at timestamp with time zone;
```

### 2. Update Edge Functions to Populate match_share_cards

Modify `forfeit-game`, `settle-game`, and `settle-draw` to upsert into `match_share_cards` on successful settlement:

```typescript
// After successful settlement in each edge function:
await supabase.from("match_share_cards").upsert({
  room_pda: roomPda,
  game_type: gameType,
  mode: "ranked", // or from session
  stake_lamports: Number(roomData.stakeLamports),
  winner_wallet: winnerWallet,
  loser_wallet: forfeitingWallet, // or computed
  win_reason: "forfeit" | "timeout" | "checkmate" | "gameover",
  winner_payout_lamports: payoutAmount,
  fee_lamports: feeAmount,
  tx_signature: signature,
  finished_at: new Date().toISOString(),
  metadata: { payout_direction: "winner_takes_all", strikes: 3 }
}, { onConflict: "room_pda" });
```

### 3. New Edge Function: match-get

Public endpoint to fetch share card data by roomPda:

**File: `supabase/functions/match-get/index.ts`**

```typescript
// Input: { roomPda: string }
// Output: Full match_share_cards row + derived display fields
// - Joins with player_profiles for stats (optional)
// - No auth required
// - CORS enabled
```

Returns:
- All match_share_cards columns
- Computed fields: net_win_sol, stake_sol, fee_sol
- Winner profile stats: total_sol_won, current_streak, favorite_game
- Match status: "settled" | "void" | "cancelled"

### 4. New Edge Function: match-og

Generate OG image for social previews (1200x630 PNG):

**File: `supabase/functions/match-og/index.ts`**

Uses Lovable AI image generation (google/gemini-2.5-flash-image) with LOVABLE_API_KEY to create branded share cards:

```typescript
// Input: roomPda via query param or body
// 1. Fetch match data from match_share_cards
// 2. Generate prompt for AI image:
//    "Create a 1200x630 game victory card for 1M Gaming platform.
//     Egyptian gold/black theme. Game: Chess. Winner: 4K8m...2Jx9.
//     Amount won: 0.1 SOL. Include pyramid logo. Premium luxury feel."
// 3. Return PNG with cache headers
```

Fallback: If AI generation fails, return a pre-designed static template SVG converted to PNG.

### 5. New Route: /match/:roomPda

Public page showing branded match result card:

**File: `src/pages/MatchPage.tsx`**

Features:
- No auth required
- Fetches data via match-get edge function
- Shows branded MatchShareCard component
- Gold confetti for winners (client detects via URL param or cookie)
- Share buttons: Copy, WhatsApp, Native share
- CTA: "Play on 1M Gaming" → /room-list

Layout:
```text
┌────────────────────────────────────────────────┐
│                 1M GAMING                       │
├────────────────────────────────────────────────┤
│                                                │
│   ┌──────────────────────────────────────┐    │
│   │  [Game Icon]           CHESS          │    │
│   │                                       │    │
│   │  🏆 WINNER                            │    │
│   │  4K8m...2Jx9                          │    │
│   │                                       │    │
│   │  ╔═══════════════════════════════╗   │    │
│   │  ║   WON 0.095 SOL              ║   │    │
│   │  ╚═══════════════════════════════╝   │    │
│   │                                       │    │
│   │  Stake: 0.05 SOL × 2 = 0.1 SOL pot   │    │
│   │  Fee: 0.005 SOL (5%)                  │    │
│   │                                       │    │
│   │  ─────────────────────────────────   │    │
│   │  📊 Winner Stats                      │    │
│   │  Total won: 1.2 SOL  |  Streak: 3    │    │
│   │                                       │    │
│   │  [RANKED] • 2 minutes ago             │    │
│   └──────────────────────────────────────┘    │
│                                                │
│  ┌────────────────────────────────────────┐   │
│  │    [Copy Link]  [WhatsApp]  [Share]    │   │
│  └────────────────────────────────────────┘   │
│                                                │
│  ┌────────────────────────────────────────┐   │
│  │     🎮 Play on 1M Gaming               │   │
│  └────────────────────────────────────────┘   │
│                                                │
└────────────────────────────────────────────────┘
```

### 6. New Component: MatchShareCard

**File: `src/components/MatchShareCard.tsx`**

Branded card component used in:
- /match/:roomPda page
- Share modal preview

Props:
- matchData: from match-get response
- compact?: boolean (for modal preview)

### 7. New Component: ShareMatchButton

**File: `src/components/ShareMatchButton.tsx`**

Button that opens share modal or native share:

Props:
- roomPda: string
- isWinner: boolean
- gameName: string

Behavior:
- Mobile with navigator.share: Opens native share sheet
- Desktop/fallback: Opens ShareMatchModal

### 8. New Component: ShareMatchModal

**File: `src/components/ShareMatchModal.tsx`**

Modal with:
- Preview of MatchShareCard (compact)
- Copy link button
- WhatsApp button
- Native share button (if available)
- Facebook button

### 9. Update GameEndScreen

Add share buttons after finalization:

```typescript
// In GameEndScreen, after payout confirmed:
{isPayoutConfirmed && isMultiplayer && (
  <ShareMatchButton
    roomPda={roomPda}
    isWinner={isWinner}
    gameName={gameTypeDisplay}
  />
)}
```

Button text:
- Winner: "🏆 Share Win"
- Loser: "📊 Share Match"

### 10. Update index.html for OG Meta Tags

Add dynamic meta tag handling. Since this is a SPA, we need server-side rendering for OG tags OR a redirect approach:

**Option A (Recommended)**: Use edge function as redirect for crawlers:
- Detect user agent for social crawlers (facebookexternalhit, Twitterbot, etc.)
- Serve HTML with proper OG tags pointing to match-og image
- Normal users get SPA

**Option B**: Add meta tags in MatchPage that update on load (limited crawler support)

### 11. Localization Keys

Add to all locale files:

```json
"shareMatch": {
  "shareWin": "Share Win",
  "shareMatch": "Share Match",
  "winner": "Winner",
  "wonAmount": "Won {{amount}} SOL",
  "stake": "Stake",
  "fee": "Platform Fee",
  "pot": "Total Pot",
  "playOn1M": "Play on 1M Gaming",
  "copyLink": "Copy Link",
  "linkCopied": "Link copied!",
  "matchDetails": "Match Details",
  "winnerStats": "Winner Stats",
  "totalWon": "Total Won",
  "currentStreak": "Current Streak",
  "matchNotFound": "Match not found",
  "matchVoided": "This match was voided",
  "matchCancelled": "This match was cancelled"
}
```

## Files to Create

| File | Description |
|------|-------------|
| `supabase/functions/match-get/index.ts` | Fetch match share card data |
| `supabase/functions/match-og/index.ts` | Generate OG image |
| `src/pages/MatchPage.tsx` | Public match result page |
| `src/components/MatchShareCard.tsx` | Branded match result card |
| `src/components/ShareMatchButton.tsx` | Share button for GameEndScreen |
| `src/components/ShareMatchModal.tsx` | Share modal with options |
| `src/lib/shareMatch.ts` | Share utility functions |

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/forfeit-game/index.ts` | Add match_share_cards upsert |
| `supabase/functions/settle-game/index.ts` | Add match_share_cards upsert |
| `supabase/functions/settle-draw/index.ts` | Add match_share_cards upsert |
| `supabase/config.toml` | Add match-get, match-og function configs |
| `src/App.tsx` | Add /match/:roomPda route |
| `src/components/GameEndScreen.tsx` | Add ShareMatchButton after payout |
| `src/i18n/locales/*.json` | Add shareMatch translations (10 files) |
| Database migration | Add winner_payout_lamports, fee_lamports, finished_at columns |

## Security & RLS

- match_share_cards already has `public_read_match_share_cards` SELECT policy
- match_share_cards has `deny_client_writes_match_share_cards` for writes
- Edge functions use service role for writes - correct pattern
- No changes needed to RLS

## Testing Checklist

1. **Settlement populates share card**: Finish a ranked match → verify match_share_cards row exists with all fields
2. **match-get returns data**: Call edge function with roomPda → get full match data
3. **Winner sees Share Win**: After payout, winner sees gold "Share Win" button
4. **Loser sees Share Match**: After loss, loser sees "Share Match" button
5. **Public page loads**: Navigate to /match/:roomPda without auth → see branded card
6. **Copy link works**: Click copy → link in clipboard
7. **WhatsApp share works**: Click WhatsApp → opens wa.me with encoded URL
8. **Native share works**: On mobile, click Share → opens system share sheet
9. **OG image generates**: Paste link in WhatsApp/Twitter → see branded preview
10. **Void/cancelled handled**: Visit void match → shows appropriate message
11. **Confetti fires**: Winner visits their match page → confetti animation

## Example Test

After finishing Room `ABC123...`:

1. Winner clicks "Share Win"
2. Modal shows: "You won 0.095 SOL playing Chess!"
3. Copy link: `https://1mgaming.com/match/ABC123...`
4. Paste in WhatsApp → preview shows 1200x630 branded image
5. Friend clicks link → sees public match page with stats
6. Friend clicks "Play on 1M Gaming" → goes to /room-list
