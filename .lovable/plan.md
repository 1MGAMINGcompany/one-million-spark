

## Cinematic Chess 3D — Visual Overhaul

The current scene looks flat and robotic because of: bird's-eye camera (too far, too high), basic plastic materials, tiny pieces, no atmosphere, and no impact effects. Here's the plan to make it look like a modern chess app cinematic replay.

### Changes (single file: `CinematicChess3DScene.tsx`)

**1. Camera — Dramatic Low Angle**
- Drop camera from `y=4.5, z=3.5` (bird's-eye) to `y=1.2, z=2.8` (player's-eye, looking across the board)
- Start slightly behind the moving piece, sweep toward destination
- Tighter field of view — pieces fill the screen instead of looking like dots

**2. Materials — Glossy & Premium**
- White pieces: `meshPhysicalMaterial` with high clearcoat (marble/porcelain look)
- Black pieces: `meshPhysicalMaterial` dark with metalness (obsidian/polished stone)
- Board light squares: subtle warm glossy finish
- Board dark squares: rich wood-like tone with slight sheen
- Gold trim: higher metalness for true gold reflection

**3. Piece Scale — 2x Bigger**
- Scale all lathe profiles by ~1.8x so pieces are prominent and recognizable
- They currently look like tiny cylinders from the camera distance — this fixes that

**4. Lighting — Cinematic Three-Point**
- Warm key light from upper-right with soft shadows
- Cool blue fill from left (creates color contrast on pieces)
- Strong gold rim light from behind for silhouette glow
- Soft ambient raised slightly so dark pieces are still readable
- On captures: brief red-tinted point light burst at impact square
- On mate: golden point light pulse

**5. Movement — Ghost Trail**
- 2-3 semi-transparent copies of the piece trailing behind during movement
- Each at decreasing opacity (0.3, 0.15, 0.05)
- Creates sense of speed and energy

**6. Capture Impact Effect**
- Expanding ring of small bright particles (8-12 tiny sphere meshes) at impact point
- Scale up and fade out over 300ms after piece lands
- Red tint for captures, gold for checkmate

**7. Background — Atmospheric**
- Dark gradient background via CSS (radial, warm center to dark edges)
- Subtle vignette overlay div on top of canvas for depth

**8. Board Polish**
- Slightly beveled look: board plane sits on a thin dark pedestal mesh (adds depth)
- Reflective floor plane below board (simple semi-transparent dark plane)

**9. Lite Tier Adjustments**
- Lite gets the new camera angle and bigger pieces (biggest visual wins)
- Lite skips: ghost trail, capture particles, reflective floor, shadows
- Lite uses `meshStandardMaterial` instead of `meshPhysicalMaterial`
- Still looks dramatically better than current

### Files Modified
- `src/components/CinematicChess3DScene.tsx` — full visual overhaul (same API, no external deps)

### Safety
- No chess logic changes
- No new dependencies (meshPhysicalMaterial is built into Three.js)
- Same pointer-events:none, same overlay pattern
- Same API contract with CinematicChessOverlay
- Fails safely to 2D fallback on WebGL error

