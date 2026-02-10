

# Add "Share Your Match" Section to Game End Screen

## What changes

A new, prominent share section will appear at the bottom of the end-game popup for **ranked and private** games (staked games). It will show for both winners and losers, with different messaging:

- **Winners**: "Brag About Your Win" with WhatsApp, Twitter/X, Copy Link, and native share buttons
- **Losers**: "Share Match" (more neutral tone) with the same sharing options

The existing small `ShareMatchButton` inside the payout success/settled blocks will be removed to avoid duplication.

## Where it appears

- Only for staked games (`isStaked && roomPda`) -- this covers both ranked and private modes
- Shows after payout is settled (success or already settled state), so the share card has real data
- Positioned between the rematch section and the exit buttons for maximum visibility

## Design

A card-like section with:
- A fun emoji-accented heading ("Brag About Your Win" or "Share Match")
- 3 action buttons in a row: WhatsApp (green), Twitter/X (dark), Copy Link (outline)
- A "More..." button using native share API (if available)
- Uses existing share utilities from `src/lib/shareMatch.ts`

## Technical Details

### File: `src/components/GameEndScreen.tsx`

1. **Import** `whatsappShareMatch`, `twitterShareMatch`, `copyMatchLink` from `@/lib/shareMatch` and `MessageCircle` from lucide-react
2. **Remove** the `ShareMatchButton` import and its two usages inside the success/settled blocks (lines 551-554 and 566-569)
3. **Add new share section** after the rematch block (around line 694), conditionally rendered when `isStaked && roomPda && isAlreadySettled`:

```
Share Your Match section:
- Heading: winner sees "Brag About Your Win", loser sees "Share Match"  
- WhatsApp button (hidden in wallet in-app browsers via existing isWalletInAppBrowser)
- Twitter/X button
- Copy Link button with copied feedback
- Native share "More..." button (if navigator.share available)
```

4. **Import** `isWalletInAppBrowser` from `@/lib/walletBrowserDetection` (already used in ShareMatchModal)

### No other files changed
- Reuses existing `whatsappShareMatch`, `twitterShareMatch`, `copyMatchLink` from `src/lib/shareMatch.ts`
- No new components needed
- No database changes

