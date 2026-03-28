

# Clean Up Navbar + Add Day/Night Theme Toggle

## Changes

### 1. Remove Create Room & Room List from nav
In `Navbar.tsx`, trim `navItems` to:
- Home
- Add Funds
- Predictions
- Leaderboard

### 2. Add Day/Night toggle
- Create a simple theme context/hook or use localStorage + `document.documentElement.classList` to toggle between `dark` class and light mode
- Add a Sun/Moon toggle button in the navbar icon row (desktop + mobile)
- Default: dark (current behavior)

### 3. Add Light theme CSS variables
In `src/index.css`, the current `:root` block IS the dark theme. Add a proper light theme by making `:root` (without `.dark`) use light colors:
- `--background`: white/near-white
- `--foreground`: dark text
- `--card`: light gray
- `--primary`: keep gold `45 93% 54%`
- `--primary-foreground`: dark
- `--secondary`, `--muted`: light grays
- `--border`: light gold/tan
- Keep gold accent system intact

The `.dark` block stays as-is.

Change `html` from `@apply dark` to no default class, and instead apply `.dark` via JS on mount (from localStorage, defaulting to dark).

### 4. File Changes

**`src/index.css`**
- Update `:root` with light theme variables (white bg, dark text, gold accents)
- Keep `.dark` block unchanged
- Remove `@apply dark` from `html` rule
- Add body background variants for light mode (lighter gradient or solid white)

**`src/hooks/useTheme.ts`** (new)
- Simple hook: reads `localStorage("theme")`, defaults to `"dark"`
- Toggles `.dark` class on `<html>`
- Returns `{ theme, toggleTheme, isDark }`

**`src/components/Navbar.tsx`**
- Remove `PlusCircle`, `LayoutList` imports and their nav items
- Import `Sun`, `Moon` from lucide
- Import `useTheme`
- Add theme toggle button next to sound/notification toggles
- Same for mobile menu

