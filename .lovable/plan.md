

## Plan: Fix 3D Cinematic Chess Mode

### Issues Found

1. **Conditional hook call (CRITICAL — line 589)**: `const glbHook = skin.glbPath ? useChessGLB() : null;` violates React's rules of hooks. Hooks cannot be called conditionally. This causes unpredictable crashes and is likely the primary source of the "mess."

2. **WebGL Context Lost**: Console shows `THREE.WebGLRenderer: Context Lost.` twice. This suggests the canvas is being recreated or there's excessive GPU memory pressure. The GLB is loaded inside the Canvas's scene tree — if the component remounts, the context gets thrashed.

3. **No `onContextLost` handler**: When WebGL context is lost, the scene silently breaks with no recovery. The `onError` callback should fire so it falls back to 2D.

### Fixes

**`src/hooks/useChessGLB.ts`** — Make the hook safe to call unconditionally:
- Add an `enabled` parameter: `useChessGLB(enabled: boolean)`. When `enabled=false`, skip scene traversal and return a `getGLBGeo` that always returns `null`. The `useGLTF` call still runs (hooks must be unconditional) but the geometry extraction is gated.
- Actually, better approach: always call `useGLTF` but gate the mesh extraction. This keeps the hook unconditional.

**`src/components/CinematicChess3DScene.tsx`** — Three fixes:
1. **Remove conditional hook**: Change line 589 from `const glbHook = skin.glbPath ? useChessGLB() : null;` to `const glbHook = useChessGLB();`. Always call the hook. The `getGeo` callback already checks `skin.glbPath` before using GLB geometry.
2. **Add WebGL context-lost handler**: On the `<Canvas>` element, add `onError` handling for context loss via `gl.domElement.addEventListener('webglcontextlost', ...)` in the `onCreated` callback, calling `onError()` to fall back to 2D.
3. **Stabilize `getGeo` deps**: The `useCallback` for `getGeo` depends on `glbHook` which is a new object every render. Stabilize by depending on `glbHook.getGLBGeo` directly.

### Files to Edit
- `src/hooks/useChessGLB.ts` — keep unconditional, no changes needed (it's already safe)
- `src/components/CinematicChess3DScene.tsx` — fix conditional hook call, add context-lost handler, stabilize deps

