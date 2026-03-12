
Goal: Fix the mobile home hero so the top section (badge, heading, CTA buttons) is truly centered and no longer appears shifted to the right.

What I found from preview audit:
- The issue is a horizontal overflow problem in the hero CTA block, not just button width.
- It reproduces clearly on narrower mobile widths (especially 320px), and can still appear on 390px when effective width is reduced.
- Main contributors are oversized/no-wrap CTA internals plus inherited button behavior, which creates right-side clipping and makes the whole hero look right-shifted.

Implementation plan:

1) Stabilize hero container shrinking (prevent overflow propagation)
- File: `src/pages/Home.tsx`
- Add `min-w-0` to the hero left content wrapper and CTA wrapper so children can shrink correctly inside grid/flex contexts.
- Keep `items-stretch` and full-width behavior for CTA stack.

2) Force CTA buttons to behave as block-width mobile elements
- File: `src/pages/Home.tsx`
- For all 4 hero CTA Buttons:
  - Add `flex` (to override inline-flex behavior in this section)
  - Add `w-full min-w-0 whitespace-normal`
  - Reduce horizontal padding on mobile (`px-4 sm:px-8`) so content has room
- For each inner `Link`:
  - Keep/add `w-full min-w-0 flex flex-col items-center`
  - Add `text-center`

3) Remove no-wrap pressure in CTA inner content
- File: `src/pages/Home.tsx`
- “Play Free” icon row:
  - Change to `flex-wrap`
  - Use tighter mobile gaps (`gap-2 sm:gap-4`)
- “Quick Match” title line:
  - Use smaller mobile text and tighter leading (`text-xl sm:text-2xl md:text-3xl leading-tight`)
  - Keep centered layout

4) Prevent headline overflow on small screens
- File: `src/pages/Home.tsx`
- Make H1 more responsive on smallest sizes:
  - From `text-5xl ...` to `text-4xl sm:text-5xl md:text-6xl lg:text-7xl`
- Keep branding style unchanged.

5) Validation checklist after implementation
- Test `/` in mobile widths: 390, 375, 320
- Confirm these are centered and not clipped:
  - Play Free
  - Quick Match
  - Create Game Room
  - View Public Rooms
  - Hero heading/subheading/badge
- Verify both English and Arabic still look correct.
- Verify section below (“Featured Games”) remains unchanged.

Technical details:
- This is a layout containment + wrapping fix localized to `Home.tsx`.
- No backend changes.
- No global button component behavior changes required (avoids regressions elsewhere).
