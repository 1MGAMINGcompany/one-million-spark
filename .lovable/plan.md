
# Add Static Build Identifier to Footer

## Overview
Add a static build identifier showing the branch and commit hash (`prelaunch-audit 8bacd62`) to the existing footer, displayed in a low-contrast style for debugging purposes.

## Current State
- Footer exists at `src/components/Footer.tsx`
- Already displays a dynamic `BUILD_VERSION` (line 71-73) in low-contrast styling
- Uses `text-[10px] text-muted-foreground/40 font-mono` for the version text

## Implementation

### File: `src/components/Footer.tsx`

**Change:** Update the build version display (lines 71-73) to show the static branch/commit identifier instead of or alongside the dynamic version.

**Before:**
```tsx
<p className="text-[10px] text-muted-foreground/40 mt-2 font-mono">
  {BUILD_VERSION}
</p>
```

**After:**
```tsx
<p className="text-[10px] text-muted-foreground/40 mt-2 font-mono">
  Build: prelaunch-audit 8bacd62
</p>
```

## Technical Notes
- The styling (`text-[10px] text-muted-foreground/40`) provides appropriately low contrast
- `font-mono` ensures the commit hash displays cleanly
- No additional imports or dependencies required
- The `BUILD_VERSION` import can be removed from line 10 since it won't be used

## Alternative Approach
If you want to keep both the dynamic version and the static identifier:
```tsx
<p className="text-[10px] text-muted-foreground/40 mt-2 font-mono">
  Build: prelaunch-audit 8bacd62 | {BUILD_VERSION}
</p>
```
