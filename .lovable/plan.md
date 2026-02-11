

# Always-On Game Logging (Production-Safe)

## The Real Problem

Right now, `dbg()` has an early return that skips everything in production unless `?debug=1`:

```text
if (!IS_DEV && !isDebugEnabled()) return;
```

This means:
- The ring buffer is empty in production
- When `reportClientError` fires on a crash, it sends zero debug events (the last 20 are all blank)
- You lose all diagnostic context for real user issues

## What Good Apps Do

Production apps (games, fintech, etc.) use a **two-tier logging** approach:

1. **Always collect** structured events into a memory ring buffer (cheap, no UI, no console spam)
2. **Only display** console output and the HUD overlay when explicitly enabled

This way, when something goes wrong, the telemetry report (`reportClientError`) always has the last N events attached -- even if the user never typed `?debug=1`.

## The Fix (1 file, ~5 lines changed)

**File: `src/lib/debugLog.ts`** -- Split the `dbg()` function into two concerns:

```text
BEFORE (line 88-89):
  if (!IS_DEV && !isDebugEnabled()) return;  // skips EVERYTHING

AFTER:
  // ALWAYS write to ring buffer (production + dev)
  // Only console.log when debug mode is active
```

Specifically:
1. Remove the early return that blocks ring buffer writes
2. Keep the `console.log` call gated behind `IS_DEV || isDebugEnabled()`
3. No other files change -- `getDbg()`, `clearDbg()`, `reportClientError`, `DebugHUD` all read from the same ring buffer and work as-is

### Updated `dbg()` logic:

```text
export function dbg(tag: string, data?: any) {
  const evt = { t: Date.now(), tag, data: sanitize(data) };

  // ALWAYS store in ring buffer (production-safe, ~50KB max)
  const w = window as any;
  if (!w.__DBG) w.__DBG = loadStored();
  const arr = w.__DBG;
  arr.push(evt);
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); } catch {}

  // Only print to console in dev or when ?debug=1 is active
  const IS_DEV = import.meta.env.DEV;
  if (IS_DEV || isDebugEnabled()) {
    try { console.log(`[DBG] ${tag}`, evt.data ?? ""); } catch {}
  }
}
```

### Also update `main.tsx` error listeners (lines 23-38):

Remove the `if (!isDebugEnabled()) return;` guards from the global error/rejection listeners so crashes are always captured in the ring buffer:

```text
window.addEventListener("error", (e) => {
  dbg("window.error", { ... });  // dbg itself handles the gating now
});
```

## What This Gets You

- Every game played on production builds up a ring buffer of the last 400 events
- If a crash happens, `reportClientError` sends those events to your `client_errors` table automatically
- The DebugHUD and console spam only appear when you opt in with `?debug=1`
- Zero performance impact -- `sanitize()` + `JSON.stringify` on small objects is sub-millisecond
- Ring buffer caps at ~50KB in localStorage, auto-evicts old entries

## Files Changed

1. **`src/lib/debugLog.ts`** -- Remove early return, gate only console output
2. **`src/main.tsx`** -- Remove `isDebugEnabled()` guards from error listeners (lines 23-34)

