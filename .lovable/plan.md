

## Plan: Fix GLB Piece Scaling in 3D Cinematic Mode

### Root Cause
The `normalizeGeometry` function in `useChessGLB.ts` independently scales each piece to a target height. If the GLB pieces have small bounding-box dimensions (common in Blender exports), the scale factor becomes enormous (e.g., a piece 0.05 units tall scaled to 1.4 = 28x magnification). This makes every piece giant, hiding the board entirely and causing WebGL context loss from GPU overload.

### Fix Strategy
Use the GLB's own board mesh (`chess_board_board1_0`) as a scaling reference instead of arbitrary target heights. Measure the board mesh's X or Z extent, compute the ratio to our procedural `BOARD_SIZE` (4 units), and apply that single uniform scale to all pieces. This guarantees pieces are correctly proportioned to our board regardless of the GLB's native units.

### Changes

**`src/hooks/useChessGLB.ts`:**

1. **Extract the board mesh's bounding box** alongside piece meshes during scene traversal
2. **Compute a `boardScale` ratio**: `BOARD_SIZE / glbBoardWidth` — this single multiplier converts all GLB coordinates to our board's coordinate space
3. **Replace `normalizeGeometry`** with a simpler approach:
   - Clone the geometry
   - Translate so the base sits at Y=0 and center X/Z
   - Apply the uniform `boardScale` (no per-piece target height normalization)
4. **Update `getGLBGeo` signature** — remove the `targetHeight` parameter since scaling is now uniform from the board reference
5. Add a dev-only log of the computed board scale and piece bounding boxes for debugging

**`src/components/CinematicChess3DScene.tsx`:**

1. **Update `getGeo` callback** — remove the `targetHeight` calculation since `getGLBGeo` no longer needs it (just pass piece + color)
2. The lathe fallback path remains unchanged

### Files to Edit
- `src/hooks/useChessGLB.ts` — board-reference scaling, remove targetHeight param
- `src/components/CinematicChess3DScene.tsx` — simplify getGLBGeo call (2 lines)

