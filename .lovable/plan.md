

## Plan: Updated Skin Unlock System + Player Profile Stats Section

### Overview
Two changes: (1) Update the skin registry with the new unlock tiers and add 3 new skins (Viking, Golden Empire, Shadow King), (2) Add a "Skins Unlocked" stat to the Player Profile page showing how many skins the player has earned.

### 1. Update Skin Registry — `src/lib/chessSkins.ts`

Update existing unlock requirements and add 3 new skins:

| Skin | Games | Shares | Status |
|------|-------|--------|--------|
| Classic | 0 | 0 | Already exists — no change |
| Samurai | 0 | 0 | Already exists — no change |
| Roman Army | 10 | 0 | **Change**: remove share requirement (was 1) |
| Cyberpunk | 25 | 1 | **Change**: shares from 3 → 1 |
| Cartoon | 50 | 3 | **Change**: shares from 5 → 3 |
| Viking | 100 | 0 | **NEW** — Nordic frost/steel theme |
| Golden Empire | 200 | 0 | **NEW** — Pure gold/obsidian luxury, requires leaderboard top 100 (tracked via shares as proxy or separate flag) |
| Shadow King | 500 | 0 | **NEW** — Dark ethereal theme |

For each new skin: define unique lathe profiles, PBR materials, board colors.

**Viking**: Ice-blue metallic white / dark iron-grey black. Stocky, angular Norse-inspired profiles. Board is grey stone with frost-blue trim.

**Golden Empire**: Rich gold / deep obsidian. Ornate, tall pieces with wide bases. Board is black marble with gold trim. Emissive gold accents.

**Shadow King**: Deep purple-black / ghostly silver-grey. Tall, narrow, ethereal profiles. Board is near-black with faint purple glow trim. Emissive purple highlights.

### 2. Update Unlock Logic — `src/hooks/useChessSkin.ts`

No structural changes needed — the `isUnlocked` check already compares `games >= unlockGames && shares >= unlockShares`. The new skins just need correct threshold values in the registry.

### 3. Add "Skins Unlocked" to Player Profile — `src/pages/PlayerProfile.tsx`

Add a new stat card in the existing stats grid showing:
- **Skins Unlocked**: `X / 8` (reads from localStorage `chess-games-completed` count, computes how many skins would be unlocked at that game count)
- Only show on own profile (since skin progress is local)
- Uses a `Palette` icon

### 4. Update Skin Picker Grid — `src/components/ChessSkinPicker.tsx`

Change grid from `grid-cols-2` to accommodate 8 skins nicely (keep `grid-cols-2` but the modal will scroll — already has `overflow-y-auto`).

### Files to Create
None

### Files to Edit
- `src/lib/chessSkins.ts` — update unlock values, add 3 new skin definitions with profiles/materials
- `src/hooks/useChessSkin.ts` — no changes needed (logic already supports new skins)
- `src/pages/PlayerProfile.tsx` — add Skins Unlocked stat card (own profile only)
- `src/components/ChessSkinPicker.tsx` — minor: no structural changes needed, grid handles 8 items

