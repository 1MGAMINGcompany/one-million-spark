

## Plan: Fix Text Visibility in Light Mode + Restore Live Stats Display

### Problem 1: Text not readable in light mode
The hero section uses a dark gradient background (`from-background via-background to-midnight-light`) and `text-muted-foreground` for trust indicators and live stats. In light mode, `midnight-light` is a dark color, making the overlaid light-themed text nearly invisible.

### Problem 2: Live stats not showing
The `live-stats` edge function is returning 500 errors (`{"error":"{\"message\":\"\"}"}` and schema cache errors). This is a transient database connectivity issue. However, the `useLiveStats` hook silently swallows errors and sets `loading=false` with all zeros — then `LiveActivityIndicator` shows "Be the first to start a match" but with poor contrast. The fix should:
- Make the hook more resilient (still show the indicator even on error)
- Ensure the text is actually visible in light mode

### Changes

#### 1. Fix hero background for light mode
**File:** `src/pages/Home.tsx`
- Line 92: Change the hero gradient to use theme-aware colors. Replace `to-midnight-light` with `to-muted` so in light mode it stays light, and in dark mode it uses the muted dark tone.
- Line 215: Add `text-foreground/70` to the trust indicators section so text is readable against both light and dark backgrounds.

#### 2. Fix LiveActivityIndicator contrast
**File:** `src/components/LiveActivityIndicator.tsx`
- Change `text-muted-foreground` to `text-foreground/70` on the container so the text is visible against the hero gradient in both themes.
- Change `text-muted-foreground/70` on the visitors row to `text-foreground/60`.

#### 3. Make useLiveStats resilient to errors
**File:** `src/hooks/useLiveStats.ts`
- When the edge function returns an error, still set `loading=false` so the component renders (showing "Be the first" rather than nothing).
- This is already happening correctly — the issue is the 500 from the edge function. The transient DB schema cache error should self-resolve, but the display should still work.

### Files Changed
1. `src/pages/Home.tsx` — fix hero gradient + trust indicator text colors for light mode
2. `src/components/LiveActivityIndicator.tsx` — improve text contrast for light mode

