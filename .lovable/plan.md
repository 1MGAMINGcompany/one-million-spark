

# Reintroduce Shareable Match Wins

## Overview

Re-create the complete match sharing system: 6 new frontend files, 2 new edge functions, modifications to 3 settlement edge functions, route addition, and GameEndScreen integration. The `match_share_cards` table already exists in the database -- no migration needed.

## New Files to Create

### 1. `src/lib/shareMatch.ts` -- Share utility functions
- `buildMatchUrl(roomPda)` -- returns `https://{origin}/match/{roomPda}`
- `copyMatchLink(roomPda)` -- clipboard copy
- `nativeShareMatch(roomPda, gameType)` -- uses `navigator.share`
- `whatsappShareMatch(roomPda, gameType)` -- HTTPS `wa.me` link (safe for wallet browsers)
- `twitterShareMatch(roomPda, gameType, solWon)` -- `x.com/intent/tweet` link

### 2. `src/pages/MatchPage.tsx` -- Public `/match/:roomPda` page
- Fetches match data via `match-get` edge function
- Displays confetti (GoldConfettiExplosion) for winners
- Shows branded MatchShareCard
- Share buttons (WhatsApp, Twitter/X, Copy Link)
- Loading skeleton and error states
- No wallet connection required (public page)

### 3. `src/components/MatchShareCard.tsx` -- Branded match card
- Game type icon/name
- Winner wallet (shortened)
- SOL won amount (brag stat)
- Winner stats from player_profiles: Win Rate, Games Won, Total SOL Won
- Losses and total games played are excluded (brag-only per design spec)
- Egyptian gold/dark theme matching site branding

### 4. `src/components/ShareMatchButton.tsx` -- Button for GameEndScreen
- Shown after settlement succeeds (finalizeState === 'success' or isAlreadySettled)
- On mobile: uses native share (navigator.share)
- On desktop: opens ShareMatchModal
- Small share icon button, positioned after payout confirmation

### 5. `src/components/ShareMatchModal.tsx` -- Share modal
- Copy Link button
- WhatsApp share (hidden in wallet in-app browsers via `isWalletInAppBrowser`)
- Twitter/X share
- Native share fallback
- Uses Dialog from radix

### 6. `supabase/functions/match-get/index.ts` -- Fetch match data
- Input: `{ roomPda }`
- Query `match_share_cards` by `room_pda`
- Fallback: query `game_sessions` if not in match_share_cards
- Join with `player_profiles` for winner stats (wins, win_rate, total_sol_won)
- Returns: match card data + winner profile stats
- No auth required (public endpoint)

### 7. `supabase/functions/match-og/index.ts` -- OG image generation
- Uses LOVABLE_API_KEY with Nano banana model for AI-generated OG images
- Input: roomPda as query param
- Fetches match data from match_share_cards
- Generates branded image with game type, winner, SOL won
- Returns PNG image for social previews
- Cache-friendly headers

## Modified Files

### 8. `supabase/functions/settle-game/index.ts`
Add match_share_cards upsert after successful settlement (after line ~928, in the DB recording block):

```typescript
// Upsert match_share_cards for sharing
try {
  const loserWallet = playersOnChain.find(p => p !== winnerWallet) || null;
  const pot = stakePerPlayer * playerCount;
  const fee = Math.floor(pot * configData.feeBps / 10_000);
  const winnerPayout = pot - fee;

  await supabase.from("match_share_cards").upsert({
    room_pda: roomPda,
    game_type: normalizeGameType(gameType),
    mode,
    stake_lamports: stakePerPlayer,
    winner_wallet: winnerWallet,
    loser_wallet: loserWallet,
    winner_payout_lamports: winnerPayout,
    fee_lamports: fee,
    tx_signature: signature,
    win_reason: reason,
    finished_at: new Date().toISOString(),
  }, { onConflict: "room_pda" });
} catch (e) {
  console.warn("[settle-game] match_share_cards upsert failed (non-fatal):", e);
}
```

Also add fallback upsert in the catch block (~line 1095) with `tx_signature: null` and `win_reason: 'settlement_failed'`.

### 9. `supabase/functions/forfeit-game/index.ts`
Same upsert pattern after successful forfeit settlement. Populate `win_reason: 'forfeit'`.
Add fallback in catch block.

### 10. `supabase/functions/settle-draw/index.ts`
Same upsert pattern for draws: `winner_wallet: null`, `win_reason: 'draw'`, `winner_payout_lamports: refund amount per player`.
Add fallback in catch block.

### 11. `src/App.tsx`
Add route and import:
```typescript
import MatchPage from "./pages/MatchPage";
// In Routes:
<Route path="/match/:roomPda" element={<MatchPage />} />
```

### 12. `src/components/GameEndScreen.tsx`
Add ShareMatchButton after the "Payout Complete" success block and after the "Already Settled" block:
```tsx
import { ShareMatchButton } from '@/components/ShareMatchButton';

// After payout success or already settled:
{isAlreadySettled && roomPda && (
  <ShareMatchButton roomPda={roomPda} gameType={gameType} />
)}
```

## Edge Function Config

Add to `supabase/config.toml`:
```toml
[functions.match-get]
verify_jwt = false

[functions.match-og]
verify_jwt = false
```

## Technical Notes

- `match_share_cards` table already exists with correct schema -- no migration needed
- RLS: public SELECT allowed, client writes blocked (only edge functions can write via service role)
- WhatsApp sharing uses HTTPS `wa.me` links (not `whatsapp://`) for wallet browser compatibility
- `isWalletInAppBrowser()` used to hide mailto links in Phantom/Solflare browsers
- OG image uses LOVABLE_API_KEY (already configured) with `google/gemini-2.5-flash-image` model
- All upserts are idempotent (onConflict: room_pda)
- Fallback upserts in catch blocks ensure Share button works even on settlement failure

## File Summary

| # | File | Action |
|---|------|--------|
| 1 | `src/lib/shareMatch.ts` | Create |
| 2 | `src/pages/MatchPage.tsx` | Create |
| 3 | `src/components/MatchShareCard.tsx` | Create |
| 4 | `src/components/ShareMatchButton.tsx` | Create |
| 5 | `src/components/ShareMatchModal.tsx` | Create |
| 6 | `supabase/functions/match-get/index.ts` | Create |
| 7 | `supabase/functions/match-og/index.ts` | Create |
| 8 | `supabase/functions/settle-game/index.ts` | Modify (add upsert) |
| 9 | `supabase/functions/forfeit-game/index.ts` | Modify (add upsert) |
| 10 | `supabase/functions/settle-draw/index.ts` | Modify (add upsert) |
| 11 | `src/App.tsx` | Modify (add route) |
| 12 | `src/components/GameEndScreen.tsx` | Modify (add ShareMatchButton) |

