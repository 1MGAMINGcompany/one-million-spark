
# Private Rooms — Step 1 (UI Only)

## Overview
Add a third mode option "🟣 Private" to the CreateRoom page alongside the existing Casual and Ranked modes. This is a UI-only change — no backend modifications.

## File Changes

### `src/pages/CreateRoom.tsx`

**Change 1: Update state type (line 84)**

Expand the `gameMode` state to include "private":

```typescript
// Before:
const [gameMode, setGameMode] = useState<'casual' | 'ranked'>('casual');

// After:
const [gameMode, setGameMode] = useState<'casual' | 'ranked' | 'private'>('casual');
```

**Change 2: Update mode toggle grid (lines 637-675)**

Change from 2-column to 3-column grid and add Private button:

```typescript
// Before:
<div className="grid grid-cols-2 gap-2">

// After:
<div className="grid grid-cols-3 gap-2">
```

Add new Private button after the Ranked button:

```typescript
<Button
  type="button"
  variant={gameMode === 'private' ? 'default' : 'outline'}
  size="sm"
  className={`h-10 ${gameMode === 'private' ? 'bg-violet-600 hover:bg-violet-700' : ''}`}
  onClick={() => {
    setGameMode('private');
    // Private rooms use custom stakes (allow any amount including 0)
    if (!isRematch) setEntryFee("0");
  }}
>
  <span className="mr-1.5">🟣</span> {t("createRoom.gameModePrivate", "Private")}
  <span className="ml-1 opacity-70 text-xs">🔗</span>
</Button>
```

**Change 3: Update helper text for all modes (lines 670-674)**

Add private mode description:

```typescript
// Before:
<p className="text-xs text-muted-foreground">
  {gameMode === 'ranked' 
    ? t("createRoom.rankedDesc")
    : t("createRoom.casualDesc")}
</p>

// After:
<p className="text-xs text-muted-foreground">
  {gameMode === 'private' 
    ? t("createRoom.privateDesc", "Private rooms don't appear in public list. Share an invite link to let friends join.")
    : gameMode === 'ranked' 
      ? t("createRoom.rankedDesc")
      : t("createRoom.casualDesc")}
</p>
```

**Change 4: Update entry fee styling and validation (lines 589-609)**

Private mode should use casual-style stake input (optional, any amount):

```typescript
// Entry fee input className - add private to casual styling
className={`h-9 ${isRematch ? 'border-primary/50' : ''} ${
  gameMode === 'casual' || gameMode === 'private'
    ? 'border-muted/50 bg-muted/20 text-muted-foreground focus:border-muted' 
    : 'border-primary/50 bg-primary/5 text-foreground focus:border-primary'
}`}

// Entry fee helper text - add private mode
<p className={`text-xs ${gameMode === 'casual' || gameMode === 'private' ? 'text-muted-foreground' : 'text-primary/80'}`}>
  {gameMode === 'casual' || gameMode === 'private'
    ? t("createRoom.stakeOptional")
    : `${t("createRoom.stakeMinRequired")} (${dynamicMinFee.toFixed(4)} SOL ≈ $${MIN_FEE_USD.toFixed(2)})`
  }
</p>
```

**Change 5: Update minimum fee validation (line 265)**

Skip minimum fee enforcement for private mode (same as casual):

```typescript
// Before:
if (gameMode === 'ranked' && entryFeeNum < dynamicMinFee) {

// After:  
if (gameMode === 'ranked' && entryFeeNum < dynamicMinFee) {
  // (no change - private mode already bypasses this since it's not 'ranked')
```

No change needed here — the existing condition already only enforces minimum for ranked.

## Visual Result

| Mode | Color | Emoji | Description |
|------|-------|-------|-------------|
| Casual | Green | 🟢 | Practice mode, optional stakes |
| Ranked | Red | 🔴 | Competitive, requires min stake |
| **Private** | **Violet** | **🟣** | **Invite-only, hidden from list** |

## What's NOT Changing

- Backend logic (edge functions, database)
- Stake logic (private uses same rules as casual)
- Turn time options (unchanged)
- Game type selection (unchanged)
- Any room creation flow

## Translation Keys Used

- `createRoom.gameModePrivate` — "Private" (with fallback)
- `createRoom.privateDesc` — Helper text (with fallback)
