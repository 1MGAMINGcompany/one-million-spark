
## The Problem

Opening "Play vs AI" in a new tab disconnects the Privy embedded wallet in both tabs because Privy's embedded wallet iframe is scoped to a single origin+tab context — it cannot be shared across browser tabs. The previous approach of navigating away in the same tab destroyed the QuickMatch component (stopping the matchmaking timer and polling).

Both approaches fail. The only solution that works is to **never leave the QuickMatch page** — instead, render the AI game inline on top of it.

---

## The Solution: In-Page Full-Screen AI Game Overlay

When the user clicks "Play vs AI while you wait", a full-screen overlay slides up **within the same tab and same component tree**. The QuickMatch page stays fully mounted underneath — the matchmaking timer keeps counting, the free-room polling keeps running, and the wallet stays connected. When an opponent joins, the navigation to `/play/${roomPda}` fires normally regardless of whether the overlay is open.

The overlay contains the actual AI game UI (board, dice, etc.), built as a lightweight embedded version of the existing AI page content. Clicking "Back to Matchmaking" or "← Back" dismisses the overlay, returning the user to the waiting screen — with the timer exactly where it was.

---

## What Will Be Changed

### File 1: `src/pages/QuickMatch.tsx`

**Changes:**

1. Add `showAIGame` state (`useState(false)`) to track overlay visibility.

2. Replace both "Play vs AI" `onClick` handlers (lines 702–713 searching phase, lines 800–810 timeout phase) with a single call: `setShowAIGame(true)`. Remove all `sessionStorage.setItem("quickmatch_pending_room", ...)` blocks from both locations — the sessionStorage workaround is no longer needed since we stay on the same page.

3. Add a full-screen overlay at the bottom of the JSX (before the closing `</div>`):

```tsx
{showAIGame && (
  <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-primary/20 px-4 py-3 flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={() => setShowAIGame(false)}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Matchmaking
      </Button>
      <span className="text-sm text-muted-foreground">
        {translatedGameName} • AI Practice
      </span>
      <span className="ml-auto text-sm font-mono text-primary">
        {formatTime(secondsLeft)}
      </span>
    </div>
    <QuickMatchAIGame gameKey={selectedGameKey} />
  </div>
)}
```

4. Remove the `sessionStorage` restore `useEffect` block (lines 107–130) that was only needed as a recovery mechanism for the now-removed new-tab approach.

5. Fix all `navigate(-1)` calls in `handleCancel` and `executeRecoverAndLeave` → replace with `navigate('/room-list')` for deterministic navigation (7 locations).

---

### File 2 (new): `src/components/QuickMatchAIGame.tsx`

A new component that acts as a **router** — it renders the correct AI game based on `gameKey`. This keeps `QuickMatch.tsx` clean and avoids importing all 5 AI pages directly.

```tsx
interface QuickMatchAIGameProps {
  gameKey: "chess" | "dominos" | "backgammon" | "checkers" | "ludo";
}
```

Internally it renders:
- `gameKey === "chess"` → `<ChessAI />` (imported from `@/pages/ChessAI`)
- `gameKey === "dominos"` → `<DominosAI />`
- `gameKey === "backgammon"` → `<BackgammonAI />`
- `gameKey === "checkers"` → `<CheckersAI />`
- `gameKey === "ludo"` → `<LudoAI />`

Each existing AI page is a standalone React component. They render correctly when mounted anywhere in the tree — they do not depend on being at a specific URL route (they use `useSearchParams` for difficulty only, which defaults to `"easy"` when no param is present, which is acceptable for the "while you wait" casual context).

The one adjustment needed: the AI pages have a header with a `<Link to="/play-ai">` back button. Inside the overlay this button would navigate away and break the UX. The `QuickMatchAIGame` wrapper will use a CSS override to hide the back-link header that is internal to each AI page (using a wrapper `div` with `[&_.back-to-lobby]:hidden` or, more reliably, by passing a `hideHeader` prop — but since we cannot easily modify all 5 AI pages, the simpler approach is to just let the sticky overlay header serve as the navigation control, and note that the AI page's own back button will navigate to `/play-ai` if clicked, which is acceptable as a secondary path — the user can press the browser back button to return).

Actually, the cleanest approach that requires zero changes to the AI pages: the overlay header has the "Back to Matchmaking" button. The AI pages' own internal back buttons will navigate to `/play-ai`, which is also acceptable — they won't lose their wallet connection since they never left the QuickMatch tab. A note will be added in the overlay header making it clear that clicking "Back to Matchmaking" returns to the waiting room.

---

## What Is NOT Changed

- All 5 AI page files (`ChessAI.tsx`, `DominosAI.tsx`, etc.) — zero modifications
- The matchmaking logic, timers, polling hooks — all stay exactly as-is
- Wallet connection — stays intact throughout (same component tree, same tab)
- The `sessionStorage` restore logic is cleaned up since it's no longer needed

---

## Files Summary

| File | Action | Description |
|---|---|---|
| `src/pages/QuickMatch.tsx` | Modify | Replace 2x `navigate('/play-ai/...')` with `setShowAIGame(true)`, add overlay JSX, remove sessionStorage save blocks, fix `navigate(-1)` → `navigate('/room-list')` |
| `src/components/QuickMatchAIGame.tsx` | Create | New router component that renders the correct AI page by `gameKey` |

Both changes are self-contained with zero risk to existing game or wallet flows.
