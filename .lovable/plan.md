

# Fix: Duplicate Share Button, WhatsApp in Wallet Browsers, and Improved Match Card Stats

## Three Issues

### 1. Duplicate "Share" buttons on Game End screen
The `ShareMatchButton` renders in 3 places in `GameEndScreen.tsx`:
- Line 548: Inside "Payout Complete" success block
- Line 568: Inside "Already Settled" block
- Line 702: A catch-all for ALL staked games

When a game is already settled, both block #2 and #3 render, producing two buttons.

**Fix**: Remove the catch-all block at lines 702-712.

### 2. WhatsApp crashes in wallet in-app browsers
Wallet browsers (Phantom, Solflare) can't handle `wa.me` redirects that resolve to `whatsapp://` scheme internally, causing `ERR_UNKNOWN_URL_SCHEME`.

**Fix**: In `ShareMatchModal.tsx`, hide the WhatsApp button when inside a wallet in-app browser using the existing `isWalletInAppBrowser()` utility. Users can still share via the native share sheet ("More...") or copy the link.

### 3. Match share page -- better winner stats
Currently the MatchShareCard shows: Total SOL Won, Current Streak, and Wins. You want to see **Total SOL Won** and **Total Games Won** only -- no losses, no games played count.

Looking at what Chess.com and similar platforms do on their share cards: they focus on **positive, brag-worthy stats only** -- wins, rating, streak, and earnings. They never show losses on share cards because the purpose is bragging/marketing.

**Fix**: Update the Winner Stats section in `MatchShareCard.tsx` to show:
- **Total SOL Won** (keep)
- **Games Won** (keep)
- **Win Streak** (keep -- this is a brag stat)

Remove `losses` and `games_played` from the `WinnerProfile` interface display (the data is still fetched but not shown). Also add a **Win Rate** stat derived from wins/games_played since that's what competitive platforms typically show.

Final stats grid: **Total SOL Won | Win Rate | Games Won**

## Technical Details

| File | Change |
|------|--------|
| `src/components/GameEndScreen.tsx` | Remove duplicate ShareMatchButton at lines 702-712 |
| `src/components/ShareMatchModal.tsx` | Import `isWalletInAppBrowser`, hide WhatsApp button when in wallet browser |
| `src/components/MatchShareCard.tsx` | Update winner stats to show: Total SOL Won, Win Rate, Games Won |

### GameEndScreen.tsx
Delete lines 702-712 (the catch-all ShareMatchButton block that duplicates the button).

### ShareMatchModal.tsx
```typescript
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";

// Inside component:
const inWalletBrowser = isWalletInAppBrowser();

// Wrap WhatsApp button:
{!inWalletBrowser && (
  <Button onClick={handleWhatsApp} ...>
    <MessageCircle /> WhatsApp
  </Button>
)}
```

### MatchShareCard.tsx
Replace the 3-column stats grid with:

| Stat | Value | Label |
|------|-------|-------|
| Total SOL Won | `total_sol_won.toFixed(2)` | "Total Won (SOL)" |
| Win Rate | `Math.round((wins / games_played) * 100)%` | "Win Rate" |
| Games Won | `wins` | "Games Won" |

