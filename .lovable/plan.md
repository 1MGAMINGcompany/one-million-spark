

## Plan: Fix Capture Explosion, Grey Board Delay, and Remove Board Animations Toggle

### Problems Identified

1. **Capture explosion not firing on AI moves**: The `AnimationDriver` resets `startTime` based on `duration` changing in its `useEffect`, but duration stays the same between player and AI moves. So when the AI fires a new cinematic event, the animation progress doesn't reset — it continues from the previous (completed) animation, meaning the explosion trigger point is never reached.

2. **Grey board for ~2 seconds after 3D exits**: The 2D board stays at `opacity-30 blur-[1px]` until `activeEvent` becomes `null`. Currently, `dismiss()` waits `duration + 500ms` (3700ms for 3d-full) before clearing `activeEvent`. The 3D dismiss swoop-out is only 800ms, but the board stays dimmed the entire 3700ms. The 2D board should snap back to full opacity immediately when the 3D scene starts fading out.

3. **Board Animations toggle is redundant**: The old 2D capture animation toggle should be removed now that the 3D cinematic toggle exists.

---

### Changes

#### 1. Fix `AnimationDriver` reset (CinematicChess3DScene.tsx)
- Change the `useEffect` dependency from `[duration]` to `[event]` (the event object) so `startTime` resets when a new cinematic event fires, not just when duration changes.
- Pass `event` as a prop to `AnimationDriver` and `SceneContent`.

#### 2. Fix grey board delay (two files)

**`useCinematicMode.ts`**:
- Reduce the dismiss timeout from `duration + 500` to just `1000ms` (800ms swoop-out + 200ms buffer). The swoop-out is a fixed 800ms regardless of tier duration.

**`ChessAI.tsx` and `ChessGame.tsx`**:
- Instead of tying the 2D board opacity to `cinematic.activeEvent`, tie it to `cinematic.isPersistent`. When `dismiss()` is called, `isPersistent` immediately becomes `false`, so the 2D board starts restoring immediately — in parallel with the 3D swoop-out fade.
- Change `duration-500` to `duration-300` for snappier restoration.

#### 3. Remove Board Animations toggle (ChessAI.tsx + ChessGame.tsx)
- Delete the `AnimationToggle` component definition from both files.
- Remove the `animationsEnabled` state and its usage.
- Remove the toggle from the UI (keep only the 3D Cinematic toggle, centered).
- Hard-code `animationsEnabled` to `true` where still referenced (capture animations).

---

### Files to Edit
- `src/components/CinematicChess3DScene.tsx` — fix AnimationDriver reset key
- `src/hooks/useCinematicMode.ts` — reduce dismiss timeout
- `src/pages/ChessAI.tsx` — fix grey board, remove AnimationToggle
- `src/pages/ChessGame.tsx` — fix grey board, remove AnimationToggle

