

# Fix: Home Page Not Centered on Mobile

## Problem Identified

The home page has **two root causes** making it appear off-center on certain mobile devices:

1. **The decorative pyramid panel renders on mobile** -- The right-side pyramid panel (`max-w-md aspect-square` = up to 448x448px) renders below the CTA buttons on mobile. On narrow screens this large decorative block can cause subtle layout shifts and makes the page unnecessarily long, pushing content off-center visually.

2. **Background blur elements are oversized** -- Two decorative blur circles (`w-96` = 384px and `w-80` = 320px) are positioned with fractional offsets (`left-1/4`, `right-1/4`). While the hero section has `overflow-hidden`, these can still affect perceived centering in some in-app browsers (Instagram, Facebook webviews) where `overflow-x: hidden` is not always respected.

3. **RTL language direction** -- 47% of recent traffic is Arabic/French speakers. When the language is Arabic, `document.documentElement.dir` is set to `rtl`, which can shift layout alignment on the home page since the grid and flex containers don't account for RTL direction explicitly.

## Fix Plan

### 1. Hide the decorative pyramid panel on mobile
- Add `hidden lg:flex` to the right-side pyramid panel container (line 194)
- This removes a ~400px tall purely decorative element that adds no value on mobile and can cause alignment issues
- The hero section becomes a single centered column on mobile

### 2. Constrain background blur elements
- Change `w-96` to `w-64 md:w-96` and `w-80` to `w-48 md:w-80` so the blur circles are smaller on mobile screens, reducing any chance of overflow

### 3. Add `overflow-hidden` to the outermost page wrapper
- Change `<div className="min-h-screen">` to `<div className="min-h-screen overflow-x-hidden">` as an extra safety net for in-app browsers

These are minimal, targeted changes -- 3 lines edited in `src/pages/Home.tsx`.

## Technical Details

| File | Line | Change |
|---|---|---|
| `src/pages/Home.tsx` | 30 | Add `overflow-x-hidden` to root div |
| `src/pages/Home.tsx` | 66 | Reduce blur circle sizes on mobile |
| `src/pages/Home.tsx` | 67 | Reduce blur circle sizes on mobile |
| `src/pages/Home.tsx` | 194 | Add `hidden lg:flex` to pyramid panel |

