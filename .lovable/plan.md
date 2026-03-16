

## Plan: Rotate GLB Pieces Upright

### Problem
The GLB model was exported from Blender (Z-up) but Three.js uses Y-up. The `scaleGeometry` function in `useChessGLB.ts` centers X/Z and aligns the base to Y=0, but the pieces' height extends along Z instead of Y, so they lie flat on the board.

### Fix

**`src/hooks/useChessGLB.ts`** — In the `scaleGeometry` function, add a -90° rotation around the X axis before centering/scaling. This converts from Z-up to Y-up:

1. Clone the geometry
2. `clone.rotateX(-Math.PI / 2)` — rotate Z-up to Y-up
3. Recompute bounding box
4. Center X/Z, align base to Y=0
5. Apply uniform board scale

This is a 2-line addition to the existing `scaleGeometry` function. No other files need changes.

