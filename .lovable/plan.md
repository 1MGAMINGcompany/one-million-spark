

## Plan: Integrate GLB Chess Pieces for Classic Skin

### Overview
Load the uploaded `chess_board.glb` and use its exact mesh geometries for the "classic" skin's 3D cinematic scene, replacing the procedural LatheGeometry pieces. Other skins keep lathe profiles as before.

### Mesh Name Mapping

Use these exact names from the GLB:

| Piece | White mesh | Black mesh |
|-------|-----------|------------|
| king | `king1_pieces_w_0` | `king2_pieces_b_0` |
| queen | `queen1_pieces_w_0` | `queen2_pieces_b_0` |
| rook | `rook1_pieces_w_0` | `rook2_pieces_b_0` |
| bishop | `bishop1_pieces_w_0` | `bishop2_pieces_b_0` |
| knight | `knight3_pieces_w_0` | `knight1_pieces_b_0` |
| pawn | `pawn1_pieces_w_0` | `pawn8_pieces_b_0` |

One mesh per piece type per color (we pick the first available variant).

### Files

**Copy asset:**
- `chess_board.glb` → `public/models/chess_board.glb`

**Create `src/hooks/useChessGLB.ts`:**
- Use `useGLTF` from `@react-three/drei` (already installed) to load `/models/chess_board.glb`
- Traverse the scene, log all mesh names once for debugging
- Build a map: `{ king_w, queen_w, rook_w, bishop_w, knight_w, pawn_w, king_b, queen_b, ... }` → `BufferGeometry`
- Export a hook that returns `getGLBGeo(piece: string, color: "white"|"black"): BufferGeometry | null`
- Preload with `useGLTF.preload("/models/chess_board.glb")`

**Edit `src/lib/chessSkins.ts`:**
- Add optional `glbPath?: string` to `ChessSkin` interface
- Set `glbPath: "/models/chess_board.glb"` on the classic skin only

**Edit `src/components/CinematicChess3DScene.tsx`:**
- Import the GLB hook
- In `getCachedGeo`: if `skin.glbPath`, try GLB geometry first; fall back to lathe if null
- GLB geometries may need scaling/centering — apply a uniform scale factor and center vertically so pieces sit on Y=0
- `StaticPiece`, `MovingPiece`, `VictimPiece`: pass `color` to geo lookup (GLB has separate white/black meshes); remove the hardcoded king cross decoration when using GLB (the GLB king already has its crown)
- The board from the GLB (`chess_board_board1_0`) is **not** used — we keep the existing procedural board for skin flexibility

### Key Details
- GLB geometries are cloned and cached per piece+color to avoid mutation issues
- The geometry's bounding box is used to auto-center and normalize height to match existing piece scale (~`PIECE_SCALE`)
- Console debug log lists all mesh names on first load (guarded behind `import.meta.env.DEV`)
- No changes to non-classic skins — they continue using lathe profiles

