

# Desktop Popover for Money AI Helper

## What Changes

Currently, Money's chat panel opens as a **full-screen bottom sheet with dark backdrop** on all screen sizes. On desktop, this feels heavy and mobile-like. We'll make it open as a **compact bottom-right corner popover** (like Intercom/Drift chat widgets) on desktop, while keeping the bottom sheet on mobile.

## Changes

### AIAgentHelperOverlay.tsx

1. **Import `useIsMobile`** from `@/hooks/use-mobile`

2. **Desktop panel layout** (when `!isMobile && !isAIRoute`):
   - Position: `fixed bottom-4 right-4` (no full-screen backdrop)
   - Size: `w-[380px] max-h-[520px]` rounded card with shadow
   - No dark overlay behind it -- just the floating card
   - Click outside closes it (optional click-away listener)

3. **Mobile panel layout** (when `isMobile && !isAIRoute`):
   - Keep current behavior: full-width bottom sheet with backdrop

4. **AI route layout**: unchanged (compact bottom bar)

5. **Bubble positioning on desktop**: when panel opens, hide the bubble (already done); when panel is a popover, it appears anchored near where the bubble was (bottom-right corner)

### Visual Result

- **Mobile**: Same as today -- bottom sheet slides up with dark backdrop
- **Desktop**: A ~380px wide card floats in the bottom-right corner, like a chat widget. No backdrop. Clean and unobtrusive.
- **AI game routes**: Unchanged compact bottom bar on both

