

# Make "Play Free" Text Bigger

## Change
Make the "PLAY FREE" text on the primary homepage button larger and bolder, while keeping the button dimensions the same.

## Technical Details

**File: `src/pages/Home.tsx` (line 118-121)**

Change the inner text span from:
```
text-lg (current, ~18px)
```
to:
```
text-2xl md:text-3xl font-bold tracking-wide (~24-30px)
```

Also bump the Bot icon from `w-5 h-5` to `w-7 h-7` so it scales with the larger text.

The button container (`py-4 px-8`) stays unchanged -- only the inner text gets bigger.

| File | Change |
|------|--------|
| `src/pages/Home.tsx` | Increase "Play Free" text size to `text-2xl md:text-3xl font-bold` and icon to `w-7 h-7` |

