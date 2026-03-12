

# Fix: CTA Buttons Shifted Right on Mobile

## Root Cause

The `Button` component with `asChild` renders as `<a>` tags (from `Link`). The button's base class uses `inline-flex`, which means even with `w-full`, the element behaves as inline and doesn't stretch to fill the parent. The parent div (line 73) has `text-center`, which centers inline elements — but since the buttons have some intrinsic width from `inline-flex`, they don't fully stretch and appear off-center/right-shifted.

## Fix

Add `w-full block` to each `Link` inside the buttons, OR more simply: add `items-center` to the CTA wrapper div and ensure buttons use `flex` display. The cleanest fix is to add `[&_a]:w-full` to the CTA container, or just add `w-full` directly on each `Link` component.

**File:** `src/pages/Home.tsx`

1. **Line 115** — Add `items-stretch` to the CTA flex container to force children to stretch:
   ```tsx
   <div className="flex flex-col items-stretch gap-4 mt-4">
   ```

2. **Lines 117, 140, 151, 160** — Add `w-full` to each `Link` so the `<a>` tag stretches:
   ```tsx
   <Link to="/play-ai" className="w-full flex flex-col items-center gap-2">
   <Link to="/quick-match" className="w-full flex flex-col items-center gap-1">
   <Link to="/create-room" className="w-full flex flex-col items-center gap-0.5">
   <Link to="/room-list" className="w-full flex flex-col items-center gap-0.5">
   ```

This ensures the `<a>` elements (which inherit `inline-flex` from the Button component) stretch to fill their containers on mobile.

