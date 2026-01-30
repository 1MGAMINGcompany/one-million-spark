

# Fix Desktop Multiplayer Backgammon Layout Only

## Scope

**What will be changed:**
- Desktop layout in `src/pages/BackgammonGame.tsx` (multiplayer version)

**What will NOT be touched:**
- Mobile layout in BackgammonGame.tsx (lines ~2200-2450)
- BackgammonAI.tsx (Play vs AI version) - completely untouched
- Any other game files

## Differences Found

| Element | AI Version (correct) | Multiplayer Desktop (current) |
|---------|---------------------|------------------------------|
| Line 2514 | `<div className="relative">` | `<div className="relative aspect-[2/1]">` |
| Line 2519 | `<div className="relative p-1 ...">` | `<div className="relative h-full p-1 ...">` |
| Line 2520 | No `h-full`, no `flex flex-col` | Has `h-full` and `flex flex-col` |
| Line 2549 | Direct board content, no wrapper | `flex-1 min-h-0 flex flex-col justify-center` |

## Changes

### File: `src/pages/BackgammonGame.tsx`

#### Change 1: Line 2514 - Remove aspect ratio
```jsx
// Before
<div className="relative aspect-[2/1]">

// After
<div className="relative">
```

#### Change 2: Line 2519 - Remove h-full from gold frame
```jsx
// Before
<div className="relative h-full p-1 rounded-xl ...">

// After
<div className="relative p-1 rounded-xl ...">
```

#### Change 3: Line 2520 - Simplify inner container
```jsx
// Before
<div className="h-full bg-gradient-to-b ... flex flex-col">

// After
<div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden">
```

#### Change 4: Line 2549 - Simplify points wrapper
```jsx
// Before
<div className="flex-1 min-h-0 flex flex-col justify-center">

// After
<div>
```

## Technical Details

These changes align the desktop multiplayer board structure with the AI version:
- Removes forced `aspect-[2/1]` that constrains natural board sizing
- Removes `h-full` constraints that interfere with content-based height
- Removes `flex-col` structure that changes how child elements are laid out
- The board will now size based on its content like the AI version does

## Verification

After implementation, test on desktop:
1. Board proportions match AI version
2. Triangles and checkers are correctly sized
3. Dice display properly in center bar
4. Turn timer still displays correctly in ranked/private modes

