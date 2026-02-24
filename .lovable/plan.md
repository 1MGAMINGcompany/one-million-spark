

# Improve Money (AI Agent) -- with Two Tweaks Applied

## Overview
Five UX improvements to Money's behavior (all UI/routing, no game logic or backend changes). Two tweaks from the original plan are incorporated:
- "Play Free" buttons navigate to `/play-ai` (the AI lobby), not a specific game
- The PvP toast button simply dismisses -- no navigation, no disruption

## A. Proactive Nudge on Key Pages

In `AIAgentHelperOverlay.tsx`, add a small floating pill near the Money bubble on `/`, `/quick-match`, `/add-funds`, `/room-list`:
- Triggers after 3 seconds OR first scroll/click (whichever first)
- Text: "Need help? Tap Money" with a "Got it" dismiss button
- On dismiss, store timestamp in localStorage (`aihelper-nudge-dismissed`); suppress for 24 hours
- Skip if Money panel is already open or hidden

## B. Replace Welcome Greeting with 1-Line Onboarding

Replace the current `showAssistMenu` greeting block (lines 628-651) with:
- One line: "Want to start with a free game or play for real SOL?"
- Two navigation buttons: **Play Free** (goes to `/play-ai`) and **Quick Match** (goes to `/quick-match`)
- Keep the 3 quick-action buttons below unchanged

## C. "How does everything work?" -- 3-Step Micro Card

Intercept `qHowItWorks` tap locally instead of sending to AI:
- 3 numbered steps (no paragraphs):
  1. Play free to learn
  2. Add SOL to your wallet
  3. Quick Match to play real opponents
- 3 navigation buttons: **Play Free** (`/play-ai`), **Add Funds** (`/add-funds`), **Quick Match** (`/quick-match`)

## D. Improved Wallet Help (Short)

Intercept `qWallet` tap locally:
- 2 lines: "Your wallet address is ready. Fund it to play for real SOL."
- 2 buttons: **Copy My Address** (clipboard) and **Go to Add Funds** (`/add-funds`)
- Falls back to AI response if no wallet connected

## E. Money Disabled in PvP Matches (Toast Only)

Current behavior: Money returns `null` when `isMultiplayer` is true (line 521). Enhancement:
- Keep Money completely hidden on `/play/` and `/room/` routes (unchanged)
- When Navbar dispatches `aihelper-show` on a multiplayer route, show a Sonner toast:
  - Text: "Money is not available in real matches to keep games fair."
  - Button: **"Got it"** -- simply dismisses the toast (no navigation, no disruption)

## i18n Keys Added (all 10 locales)

- `onboardingPrompt`, `btnPlayFree`, `btnQuickMatch`
- `howStep1`, `howStep2`, `howStep3`
- `walletHelpLine`, `btnCopyAddress`, `btnAddFunds`
- `pvpBlocked`, `btnGotIt`
- `nudgeText`, `nudgeDismiss`

## Files Changed

| File | Change |
|------|--------|
| `src/components/AIAgentHelperOverlay.tsx` | Nudge system (A), onboarding rewrite (B), intercept "how it works" + wallet help (C, D), PvP toast (E), new i18n keys in `dict` |

## What is NOT touched
- No game logic, matchmaking, timers, settlement, or Solana program changes
- No edge functions, database, or backend changes
- No changes to Navbar, game pages, or any other components
