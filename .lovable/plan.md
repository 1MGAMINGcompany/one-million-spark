

## Plan: Remove Camera Swoop — Keep Board Static in 3D

### Problem
The camera swoops from top-down to a dramatic low angle on entry ("swoop-in") and back on exit ("swoop-out"). This creates a jarring angle change that the user doesn't want. The board should stay at a **fixed perspective** throughout the entire 3D session — no camera movement at all. Only the pieces move and explosions play.

### Changes

#### 1. `src/components/CinematicChess3DScene.tsx`

**CameraRig**: Replace all the swoop-in/swoop-out lerp logic with a single fixed camera position. Set camera once on mount to a slightly elevated dramatic angle (not top-down, not swooping) and never move it. Remove the `progressRef`, `isFirstEntryRef`, `isDismissingRef`, `dismissProgressRef` dependencies from `CameraRig` entirely — the camera is static.

Fixed position: something like `(0, 4.5, 3.0)` looking at `(0, 0, 0)` — elevated enough to see the full board with a slight 3D perspective, matching the feel of looking at a real chess board.

**getPhase**: Simplify — remove `"swoop-in"` and `"swoop-out"` phases. The animation is now just `"move"` (0.0–0.85) and `"hold"` (0.85–1.0) for all cases (first entry or subsequent).

**SceneLighting**: Remove the `swoopFactor` logic that dims/brightens lights during swoop. Use fixed cinematic lighting from the start.

**DismissDriver**: Keep it but only for triggering `onComplete` after a delay — it no longer drives camera movement.

**Container fade**: Keep the opacity 0→1 fade-in and 1→0 fade-out on the container div. This is the only transition effect — a clean crossfade between 2D and 3D, no camera angle changes.

#### 2. `src/hooks/useCinematicMode.ts`
- `isFirstEntry` is no longer needed for camera logic but can remain for internal state tracking (harmless). No changes needed here.

### Files to Edit
- `src/components/CinematicChess3DScene.tsx` — simplify CameraRig, getPhase, SceneLighting, DismissDriver

