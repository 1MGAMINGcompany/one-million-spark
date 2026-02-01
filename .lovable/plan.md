

## Backgammon Desktop Overflow Fix - Change 1

### Current Code (Lines 2129-2133)
```tsx
<div className={cn(
  "game-viewport bg-background flex flex-col relative",
  isMobile ? "min-h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] overflow-hidden" : "min-h-[calc(100dvh-4rem)]",
  "pb-[env(safe-area-inset-bottom)]"
)}>
```

### Updated Code
```tsx
<div className={cn(
  "game-viewport bg-background flex flex-col relative lg:overflow-visible",
  isMobile ? "min-h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] overflow-hidden" : "min-h-[calc(100dvh-4rem)] lg:max-h-none",
  "pb-[env(safe-area-inset-bottom)]"
)}>
```

### Changes Made
1. **Line 2130**: Added `lg:overflow-visible` to the base class list
2. **Line 2131**: Added `lg:max-h-none` to the desktop branch (after `min-h-[calc(100dvh-4rem)]`)

### What This Does
- On desktop (`lg:` breakpoint), overrides the `overflow: hidden` from `.game-viewport` CSS
- On desktop, removes max-height constraint allowing natural content flow
- Mobile branch remains **completely unchanged** - still has strict viewport locking

