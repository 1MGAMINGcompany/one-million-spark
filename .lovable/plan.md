

# Make Quick Match Subtext Match Main Button Text Color

## What changes
One small styling change on the Quick Match button's subtext line ("Play real opponents. Winner takes the SOL pool.").

## Why
The subtext is currently dimmed (`text-background/70`), making it hard to read. By matching the color to the main "Quick Match (Win SOL)" text, users immediately understand this is the real-opponents button.

## Technical detail

**File:** `src/pages/Home.tsx`, line 131

Change the subtext class from:
`text-xs font-normal text-background/70 tracking-wide`

To:
`text-xs font-normal text-primary-foreground tracking-wide`

This gives the subtext the same color as the main button label, making "Play real opponents. Winner takes the SOL pool." fully visible and prominent.

No other files or components are touched.

