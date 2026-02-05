

## Fix: Get Last Move Correctly for Timeout Detection

### The Bug
The `get-moves` Edge Function returns ALL moves ordered by `turn_number ASC` (ascending). The client code incorrectly assumes `limit: 1, orderDesc: true` works, and reads `moves?.[0]` — which is the **first** move of the game, not the latest.

### The Fix
Change `[0]` to `.at(-1)` to get the **last** element of the array.

---

### File: `src/pages/BackgammonGame.tsx`

### Location: Around line 817 (inside the polling fallback)

**Current code:**
```tsx
const { data: movesData } = await supabase.functions.invoke("get-moves", {
  body: { roomPda, limit: 1, orderDesc: true },
});
const lastMove = movesData?.moves?.[0];
```

**Replace with:**
```tsx
const { data: movesData } = await supabase.functions.invoke("get-moves", {
  body: { roomPda },
});
const lastMove = movesData?.moves?.at(-1);
```

---

### Summary

| Before | After |
|--------|-------|
| `moves?.[0]` (first move) | `moves?.at(-1)` (last move) |
| Passes unused `limit`/`orderDesc` | Clean request body |

### Expected Result
- When opponent times out, the polling correctly detects `turn_timeout` as the last move type
- Toast notification "Opponent skipped" displays correctly
- No changes to Edge Function or surrounding logic

