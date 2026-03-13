

## Plan: Shift overlay content block lower in hero

The overlay content (pill, headline, subtitle) is anchored to `bottom-0` with `pb-2`. The sport tabs are outside the hero `div`, sitting directly below it.

To push the overlay text block lower — revealing more of the image above — I'll increase the hero container height while keeping the overlay anchored to the bottom. This way the image gets more visible space at the top without changing image positioning, element spacing, or sizes.

**Changes (single file: `src/pages/FightPredictions.tsx`):**

1. **Line 273** — Increase hero height from `h-48 sm:h-64 md:h-80` → `h-56 sm:h-72 md:h-96` (adds ~2rem at each breakpoint, exposing more image above the overlay)

No other changes needed. The overlay stays at `bottom-0 pb-2`, sport tabs remain outside the hero — everything shifts down together since the container is taller.

