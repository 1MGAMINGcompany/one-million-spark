

# Hide Money AI Agent — All Access Points

## Changes

### 1. `src/App.tsx`
- Comment out or remove the `<AIAgentHelperOverlay />` render (line 164)
- Remove the import (line 54)

### 2. `src/components/Navbar.tsx`
- Remove the "Money AI Helper" button in desktop nav (lines 170-177)
- Remove the "Money AI Helper" button in mobile menu (lines 383-390)
- Remove the `Sparkles` import if no longer used

### 3. Other overlays (chess/checkers/backgammon/dominos/ludo onboarding)
- These reference Money's image but are self-contained onboarding tips — leave them as-is since they don't open the AI agent panel

No files deleted — just hidden so it can be re-enabled later.

