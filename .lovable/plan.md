

# Fix Mobile Button Alignment on Home Page

## Problem

The CTA buttons in the hero section are shifted to the right on mobile instead of being centered. This happens because the `Button` component uses `inline-flex` (from `buttonVariants`), which gives buttons intrinsic width rather than stretching to fill the container. In a `flex-col` layout, this causes them to align to the start (or appear off-center depending on text-alignment inheritance).

## Fix

Add `w-full` to every `Button` in the CTA section (lines 115-168) so they stretch to fill the container width on all screen sizes. This is a straightforward className addition — no logic changes.

**File:** `src/pages/Home.tsx`

| Line | Button | Change |
|---|---|---|
| 116 | Play AI Free | Add `w-full` |
| 139 | Quick Match | Add `w-full` |
| 150 | Create Room | Add `w-full` |
| 159 | View Public Rooms | Add `w-full` |

Each button just needs `w-full` appended to its existing `className` string. The two bottom buttons (Create Room / View Public Rooms) are already in a `flex-col sm:flex-row` wrapper with `flex-1`, but adding `w-full` ensures they fill properly on mobile too.

