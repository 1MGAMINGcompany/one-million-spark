
# Plan Verdict: Safe to Apply, With One Refinement

## Summary

All three proposed fixes are correct and safe. None will break existing functionality. Two are straightforward and low-risk. One has a subtle gap that should be addressed.

---

## Fix 1 — ChessAI.tsx: Missing deps on `checkGameOver` (CONFIRMED BUG, SAFE FIX)

**Verdict: Correct. Apply as-is.**

Current code at line 183:
```
}, [play]);
```

The `checkGameOver` callback captures `recordWin`, `recordLoss`, `getDuration`, and `t` from the outer scope, but none of them are in the dep array. This is a confirmed stale closure — they are frozen at the first render value and never updated.

Comparing to the other AI pages:
- `CheckersAI.tsx` line 456: includes `checkGameOver` in the `useEffect` dep array and calls `recordWin`/`recordLoss` directly in the effect, not inside `checkGameOver` — so it works fine.
- `DominosAI.tsx` line 188: includes `recordWin, recordLoss` directly in the `checkGameOver` dep array — correct.
- `BackgammonAI.tsx` and `LudoAI.tsx`: call `recordWin`/`recordLoss` directly in effects/handlers, not inside a `checkGameOver` callback — so they work fine.

Only Chess wraps `recordWin`/`recordLoss` inside a `useCallback`-wrapped `checkGameOver` without listing them as deps. The fix is simple and carries zero risk of breaking anything.

**Change:** Line 183 in `src/pages/ChessAI.tsx`
```typescript
// Before
}, [play]);

// After
}, [play, recordWin, recordLoss, getDuration, t]);
```

---

## Fix 2 — live-stats/index.ts: Preserve page/game on global heartbeat (CONFIRMED BUG, SAFE FIX WITH ONE REFINEMENT)

**Verdict: Correct direction, but the proposed fix has a subtle gap.**

The confirmed problem: The global heartbeat from `App.tsx` sends `page: null, game: null` every 30 seconds, and the current `UPDATE` on line 47 unconditionally overwrites both fields — erasing the richer `page`/`game` values that `useAIGameTracker` just wrote.

The proposed fix is:
```typescript
.update({ 
  last_seen: now, 
  ...(page != null ? { page } : {}), 
  ...(game != null ? { game } : {}) 
})
```

This is correct and safe. However there is one subtle gap: the INSERT on lines 36–42 still includes `page: page ?? null` and `game: game ?? null`. The INSERT only fires on the very first visit (subsequent inserts are silently ignored due to the unique constraint on `session_id`), so this is only a problem for the very first heartbeat a new user sends. If the first heartbeat happens to be a global null one (which it nearly always will be, since `App.tsx` fires first), the row is inserted with `game: null`. Then `useAIGameTracker` sends `game: "chess"` — the UPDATE now correctly preserves it because `game != null`. So there is no actual problem with the INSERT gap; it only affects the first-row initial value, which is immediately corrected by the AI tracker's heartbeat within seconds.

**No additional change needed to the INSERT block.**

**Change:** Line 47 in `supabase/functions/live-stats/index.ts`
```typescript
// Before
.update({ last_seen: now, page: page ?? null, game: game ?? null })

// After
.update({ 
  last_seen: now, 
  ...(page != null ? { page } : {}), 
  ...(game != null ? { game } : {}) 
})
```

---

## Fix 3 — App.tsx: Pass page context to `usePresenceHeartbeat` (IMPROVEMENT, SAFE)

**Verdict: Good improvement, zero risk.**

Currently `usePresenceHeartbeat()` is called with no arguments on line 88. The hook signature already accepts `page?` and `game?`, so passing a derived page value is a drop-in change with no side effects.

Note: `usePresenceHeartbeat` has `// eslint-disable-next-line react-hooks/exhaustive-deps` and an empty dep array `[]` on line 36. This means even if `page` changes (user navigates), the heartbeat interval will NOT pick up the new page until the component remounts. For a global component like `AppContent` that never remounts, this means the page value is effectively locked to the value at first mount.

This is still a big improvement over sending `null` always. The correct fix is to also update the dep array in `usePresenceHeartbeat` to include `[page, game]`, but that would restart the interval on every navigation, causing one extra heartbeat per page change — which is fine and actually desirable.

The plan should include updating the `usePresenceHeartbeat` hook's dep array as well, otherwise the page context will always be `"home"` (the initial mount path) even when the user navigates elsewhere.

**Changes needed:**

`src/App.tsx` line 88:
```typescript
// Before
usePresenceHeartbeat();

// After — derive page label from pathname
const page = location.pathname === "/"
  ? "home"
  : location.pathname.startsWith("/play-ai/")
  ? location.pathname.replace("/play-ai/", "ai-")
  : location.pathname.startsWith("/play/")
  ? "multiplayer"
  : location.pathname.startsWith("/room/")
  ? "room"
  : location.pathname.replace("/", "") || "home";

usePresenceHeartbeat(page);
```

`src/hooks/usePresenceHeartbeat.ts` — update dep array so the interval restarts when the page changes:
```typescript
// Before
  }, []);  // line 36

// After
  }, [page, game]);
```

---

## What Will Not Break

| Area | Risk | Reason |
|------|------|--------|
| Chess gameplay | None | Dep array addition only affects when `checkGameOver` is re-created — all gameplay paths stay identical |
| Other AI games | None | Not touched |
| Multiplayer games | None | Not touched |
| Heartbeat frequency | None | Still fires every 30s; one extra send when user navigates pages |
| Existing `page`/`game` data | None | The UPDATE change only omits keys when null — no data loss |
| `presence_heartbeats` table | None | No schema change needed |
| Edge function deploy | None | Single-file change, safe to redeploy |

---

## Files to Change (Final List)

| File | Change |
|------|--------|
| `src/pages/ChessAI.tsx` | Add `recordWin, recordLoss, getDuration, t` to `checkGameOver` dep array (line 183) |
| `supabase/functions/live-stats/index.ts` | Make UPDATE preserve existing `page`/`game` when incoming value is null (line 47) |
| `src/App.tsx` | Derive page label from pathname, pass to `usePresenceHeartbeat(page)` (line 88) |
| `src/hooks/usePresenceHeartbeat.ts` | Update dep array from `[]` to `[page, game]` so interval restarts on navigation |

---

## Expected Outcome After All Four Changes

- Chess `game_won` / `game_lost` events fire reliably on every checkmate
- `presence_heartbeats` shows the correct current page for all visitors
- AI game heartbeats with `game: "chess"` etc. are no longer overwritten back to null by the global 30s heartbeat
- The "playing AI now" count in `LiveActivityIndicator` becomes accurate
