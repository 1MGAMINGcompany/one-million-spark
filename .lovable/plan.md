

## Plan: Dramatic Capture Sequence and Lower Camera Angle

### Problems
1. **Captured piece disappears before attacker arrives** — The `staticPieces` filter removes the piece on the destination square (`event.to`) immediately, so it's never rendered. The captured piece should stay visible until the attacker lands on it, then crack/shatter into gold fragments.
2. **Explosion is too basic** — Current explosion is 60 small boxes that fade out quickly. Needs to be more dramatic: more particles (120+), bigger, brighter, with a gold flash and lingering embers.
3. **Camera angle too high** — `FIXED_CAM_POS = (0, 4.5, 3.0)` is fairly steep. Lowering it will give a more dramatic, board-level perspective.

### Changes — Single file: `src/components/CinematicChess3DScene.tsx`

#### 1. Lower camera angle
Change `FIXED_CAM_POS` from `(0, 4.5, 3.0)` to `(0, 3.2, 4.2)` — lower Y, more Z — giving a more dramatic eye-level perspective while still seeing the full board.

#### 2. Add `VictimPiece` component (captured piece stays visible, then cracks)
- New component renders the captured piece at `event.to` position
- Stays fully visible while `moveT < 0.65` (attacker hasn't arrived yet)
- From 0.65–0.85: piece starts shaking/vibrating (impact phase)
- At 0.85+: piece scales down rapidly to 0, as if crushed — simultaneously the explosion fires
- Uses imperative `useFrame` like everything else

#### 3. Fix `staticPieces` filter
- Currently filters out `event.to` — keep this so the VictimPiece handles it separately
- The VictimPiece is a new dedicated component added alongside CaptureExplosion when `event.isCapture` is true

#### 4. Enhanced `CaptureExplosion`
- Increase particle count from 60 to 120
- Larger particle sizes (0.02–0.06 range)
- Higher initial velocities for more dramatic spread
- Add a gold flash: a sphere at the capture point that scales up from 0 to 0.5 then fades, giving a bright impact flash
- Slower fade-out so particles linger longer
- Trigger at 0.80 instead of 0.70 (synced with victim piece crush)
- Add emissive intensity boost for brighter glow

#### 5. Adjust `MovingPiece` arc for captures
- When `isCapture` is true, reduce the arc height slightly (0.15 instead of 0.3) so the piece comes down more aggressively — a "slamming" motion rather than a gentle arc

### Files to edit
- `src/components/CinematicChess3DScene.tsx`

