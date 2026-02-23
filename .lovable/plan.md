
# Fix Money the Monkey: Drag, Dismiss, and Navbar Access

## Problems Identified

1. **Drag is broken**: The current logic requires holding 800ms before dragging activates, but ANY finger movement >12px cancels BOTH timers (open and drag). On mobile, it's nearly impossible to hold perfectly still for 800ms, so the drag never activates.

2. **No way to dismiss Money**: Once visible, the floating bubble is always on screen. Users can't hide it.

3. **No way to re-access Money after dismissing**: If we let users hide the bubble, they need a way to bring it back.

---

## Plan

### 1. Fix Drag Behavior (AIAgentHelperOverlay.tsx)

Change the interaction model to match what similar apps do (e.g., chat widgets like Intercom, Drift):

- **Quick tap** (under 300ms, minimal movement): Opens the chat panel immediately
- **Hold and drag** (any duration, movement >12px): Starts dragging immediately once movement threshold is crossed -- no need to wait 800ms
- Remove the rigid timer-based approach that conflicts with natural finger movement

### 2. Add "Hide Money" Option (AIAgentHelperOverlay.tsx)

- Add a small "Hide" button visible when the chat panel is open (next to the X close button)
- When tapped, sets a flag in localStorage (`aihelper-hidden`) and hides the floating bubble
- The bubble and panel both disappear

### 3. Add "AI Helper" to Navbar Dropdown (Navbar.tsx)

- Add a "Money AI Helper" menu item in both desktop and mobile navigation
- On desktop: add it as a small button/icon near the other toggle buttons (sound, notifications)
- On mobile: add it as a nav link in the mobile menu
- When tapped: unhides Money (clears the `aihelper-hidden` flag) and opens the chat panel
- Uses a monkey/sparkle icon to be recognizable

---

## Technical Details

### AIAgentHelperOverlay.tsx Changes

- Replace the dual-timer system (OPEN_DELAY + DRAG_DELAY) with simpler logic:
  - `onPointerDown`: record start position and time
  - `onPointerMove`: if movement >12px, enter drag mode (move bubble with finger)
  - `onPointerUp`: if no drag occurred and touch was short (<300ms or so), open panel
- Add `hidden` state backed by localStorage key `aihelper-hidden`
- Add a "Hide Money" button in the panel header
- Export a way for the Navbar to unhide + open (via a custom event or a shared localStorage key that the overlay listens to)

### Navbar.tsx Changes

- Add a monkey icon button (using Sparkles or a custom icon) in the desktop toolbar area
- Add a "Money AI Helper" row in the mobile menu
- On click: dispatch a custom event `aihelper-show` that the overlay listens for, which clears the hidden flag and opens the panel

### Communication Between Navbar and Overlay

Use a simple custom DOM event pattern:
- Navbar dispatches: `window.dispatchEvent(new Event("aihelper-show"))`
- Overlay listens: `window.addEventListener("aihelper-show", ...)` to unhide and open
