

## Plan: Chess Piece Skins System — HD Themed Sets with Unlock Progression

### Overview
Add 5 themed chess piece skins to the 3D cinematic mode. Each skin defines unique piece silhouette profiles, materials (colors, metalness, roughness), and board colors. Users start with **Classic** and **Samurai** unlocked. The remaining 3 skins (**Roman Army**, **Cyberpunk**, **Cartoon**) unlock after completing a certain number of games AND sharing a win or loss.

### Skin Definitions

Each skin is a data object containing:
- **Piece profiles** — unique `[radius, height][]` lathe curves per piece type (e.g. Samurai knight has a katana-like silhouette, Cyberpunk has angular/geometric shapes, Cartoon has exaggerated proportions)
- **Materials** — white/black color palettes, metalness, roughness, clearcoat, emissive values (e.g. Roman = bronze/iron, Cyberpunk = neon cyan/magenta with emissive glow, Cartoon = bright saturated flat colors)
- **Board colors** — light/dark square colors and trim color per skin (e.g. Samurai = dark wood tones, Cyberpunk = dark grey with neon trim)
- **Special piece decorations** — per-skin extras (king cross variations, knight head shapes, rook battlements)

### Unlock Requirements
| Skin | Unlock Condition |
|------|-----------------|
| Classic | Free (default) |
| Samurai | Free (unlocked at start) |
| Roman Army | 10 completed games + 1 shared result |
| Cyberpunk | 25 completed games + 3 shared results |
| Cartoon | 50 completed games + 5 shared results |

### Architecture

#### 1. New file: `src/lib/chessSkins.ts`
Central skin registry. Each skin is a typed object:
```typescript
interface ChessSkin {
  id: string;
  name: string;
  description: string;
  preview: string; // emoji or icon
  unlockGames: number;
  unlockShares: number;
  profiles: Record<string, [number, number][]>;
  whiteMat: MaterialConfig;
  blackMat: MaterialConfig;
  boardLight: string;
  boardDark: string;
  boardTrim: string;
  specialDecorations?: Record<string, DecorationConfig>;
}
```
All 5 skins defined here with unique lathe profiles and materials.

#### 2. New file: `src/hooks/useChessSkin.ts`
- Reads selected skin from `localStorage` key `chess-skin`
- Reads unlock progress from `localStorage`:
  - `chess-games-completed` (incremented by `useAIGameTracker` and game end handlers)
  - `chess-shares-count` (incremented when user shares via `AIWinShareCard` or `SocialShareModal`)
- Exposes: `{ activeSkin, setSkin, unlockedSkins, progress }`
- Computes which skins are unlocked based on counts vs thresholds

#### 3. New file: `src/components/ChessSkinPicker.tsx`
- Modal/drawer UI showing all 5 skins in a grid
- Each skin card shows: name, preview (small 3D-rendered board or static image), lock/unlock status, progress bar if locked
- Locked skins show "Play X more games" and "Share Y more results" requirements
- Tapping an unlocked skin selects it immediately
- Accessible from the chess game pages via a small palette icon next to the cinematic toggle

#### 4. Update: `src/components/CinematicChess3DScene.tsx`
- Accept a `skinId` prop
- Replace hardcoded `PIECE_PROFILES`, `getCachedGeo`, `getCachedMat`, board colors with skin-driven lookups
- Clear geometry/material caches when skin changes (keyed by `skinId`)
- The skin data flows from the game page → overlay → 3D scene

#### 5. Update: `src/pages/ChessAI.tsx` and `src/pages/ChessGame.tsx`
- Import `useChessSkin` hook
- Pass `skinId` through cinematic pipeline
- Add skin picker button in the game toolbar
- Increment `chess-games-completed` on game end
- Increment `chess-shares-count` when share action is triggered

#### 6. Update: `src/components/AIWinShareCard.tsx` (and any loss share)
- After successful share action, increment `chess-shares-count` in localStorage

### Skin Visual Details

**Classic**: Current marble white / obsidian black. Standard lathe profiles. Traditional wood board.

**Samurai**: Matte dark lacquer (black) / ivory bone (white). Taller, slimmer pieces. Knight has a curved katana-inspired silhouette. Board is dark walnut with red-gold trim.

**Roman Army**: Bronze metallic (white side) / dark iron (black side). Stockier, military pieces. Rook resembles a fortress tower. Board is sandstone/dark stone with bronze trim.

**Cyberpunk**: Neon cyan emissive (white) / magenta emissive (black). Angular, geometric lathe profiles. All pieces have slight emissive glow. Board is dark charcoal with neon-blue grid lines.

**Cartoon**: Bright saturated colors (yellow-orange white / purple-blue black). Exaggerated proportions — fat pawns, tall wobbly king. Low metalness, high roughness (matte). Board is pastel green/cream with rainbow trim.

### Files to Create
- `src/lib/chessSkins.ts` — skin definitions (profiles, materials, board colors)
- `src/hooks/useChessSkin.ts` — skin selection and unlock logic
- `src/components/ChessSkinPicker.tsx` — UI for browsing and selecting skins

### Files to Edit
- `src/components/CinematicChess3DScene.tsx` — accept `skinId`, use skin data for rendering
- `src/components/CinematicChessOverlay.tsx` — pass `skinId` through
- `src/hooks/useCinematicMode.ts` — optionally carry skinId
- `src/pages/ChessAI.tsx` — integrate skin hook, picker button, track progress
- `src/pages/ChessGame.tsx` — same as ChessAI
- `src/components/AIWinShareCard.tsx` — increment share count on share

### Database
No database changes needed. All skin progress is tracked in `localStorage` for simplicity (AI games are local). If the user later wants cross-device sync, we can migrate to a backend table.

