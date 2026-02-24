

# Improve Money Nudge + Add Auto-Open Sheet for Home

## Overview
Three changes: (1) replace the nudge pill with action buttons, (2) add an auto-open mini sheet on Home for first-time/returning visitors, (3) keep PvP blocking unchanged.

## 1. Replace Nudge Pill (lines 645-664)

Replace the current "Need help? Tap Money" + "Got it" pill with two buttons and an X dismiss:

- **"Play Free Now"** button (primary styled) -- navigates to `/play-ai`, dismisses nudge
- **"Ask Money"** button (secondary/outline) -- opens Money panel (`setSheetOpen(true)`), dismisses nudge
- **X close button** -- dismisses with 24h cooldown (same `aihelper-nudge-dismissed` localStorage key)
- Tapping outside also dismisses (add a click-away handler)
- Remove the "Got it" button entirely

Add i18n keys across all 10 locales:
- `nudgePlayFree`: "Play Free Now"
- `nudgeAskMoney`: "Ask Money"

Update `nudgeText` to remove or keep as fallback; the pill now shows two buttons instead of text + "Got it".

## 2. Auto-Open Mini Sheet on Home (new feature)

On `/` only, after 6 seconds, auto-open a small bottom sheet (not the full Money chat panel):

- **Condition**: Home page only, not already dismissed in 24h (`aihelper-autosheet-dismissed` localStorage key), Money panel not already open, user hasn't clicked any CTA yet
- **Content**: One line + two buttons (reuses existing `onboardingPrompt`, `btnPlayFree`, `btnQuickMatch` keys)
- **Dismiss**: X button or clicking outside stores timestamp, suppresses for 24h
- **Implementation**: New state `showAutoSheet` + a `useEffect` with 6s timer on `/`. Renders as a small fixed bottom card (not the full Money panel). Track a `ctaClicked` ref that flips true on any link click to `/play-ai` or `/quick-match` within the page -- if true, skip the auto-sheet.

Add i18n key: (none needed -- reuses `onboardingPrompt`, `btnPlayFree`, `btnQuickMatch`)

## 3. PvP Routes -- No Changes

The existing PvP blocking logic (lines 564-586 and line 628) remains exactly as-is. Money returns `null` on multiplayer routes and shows a toast if triggered via navbar.

## Technical Details

### File: `src/components/AIAgentHelperOverlay.tsx`

**Constants to add:**
```text
const AUTOSHEET_KEY = "aihelper-autosheet-dismissed";
```

**New i18n keys (all 10 locales):**
- `nudgePlayFree` / `nudgeAskMoney`

**New state:**
- `showAutoSheet` (boolean) -- controlled by a 6s timer on Home

**Nudge pill rewrite (lines 645-664):**
Replace the single-line pill with a compact card containing "Play Free Now" + "Ask Money" + X button. Add a click-outside dismiss using `onPointerDown` on a backdrop or `useEffect` with document click listener.

**Auto-sheet (new JSX block after the nudge pill):**
Small fixed bottom card with rounded top corners, minimal height (~120px), showing the onboarding prompt line and two buttons. Only renders when `showAutoSheet && !sheetOpen && location.pathname === "/"`.

**CTA click detection:**
Listen for clicks on links going to `/play-ai` or `/quick-match` on the Home page. If detected before the 6s timer fires, cancel the auto-sheet. Use a ref `ctaClickedRef` set via a capturing click listener.

### What is NOT touched
- No game logic, matchmaking, timers, settlement, or Solana program changes
- No edge functions, database, or backend changes
- No changes to Navbar, game pages, or any other components
- PvP blocking behavior unchanged

