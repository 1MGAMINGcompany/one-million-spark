
# QuickMatch Waiting Screen — Full Enhancement

## What the User Asked For
Three features on the searching/waiting screen:
1. **Play vs AI while you wait** — fun mini-CTA to jump into an AI game without losing the room
2. **Room stays listed** — clear, friendly messaging that the room lives in the Room List for 15 minutes even after the 5-minute UI countdown
3. **Share room link with a friend** — a share button visible during the searching phase (for all game types, not just multi-player Ludo)
4. **Extend the countdown timer from 60s to 5 minutes** (as previously planned)
5. **Good translations across all 10 languages**

---

## Current State (Confirmed by Code Audit)

| What | Where | Current State |
|---|---|---|
| Countdown timer | `QuickMatch.tsx` line 65 | `SEARCH_TIMEOUT_SEC = 60` (60 seconds) |
| Searching phase UI | `QuickMatch.tsx` lines 613–684 | Only shows game icon, countdown, progress bar, stake info, and cancel. No share, no Play AI |
| Share/copy link | Lines 654–676 | Only appears for multi-player Ludo (3–4 players), hidden for all 2-player games |
| Timeout screen | Lines 687–714 | Has "Keep Searching" and "Play vs AI" buttons — but they're on the WRONG screen (timeout, not waiting) |
| AI game paths | `App.tsx` | `/play-ai/ludo`, `/play-ai/chess`, `/play-ai/dominos`, `/play-ai/backgammon`, `/play-ai/checkers` |
| i18n `quickMatch` section | All 10 locale files | Has 29 keys, all complete — new keys must be added to all 10 files |

---

## What Changes

### 1. Extend the timer from 60s → 300s with mm:ss display

`SEARCH_TIMEOUT_SEC` changes from `60` to `300`.

The countdown display currently shows `"{{seconds}}s"`. At 300s, "300s" looks cold and mechanical. The display becomes a `mm:ss` format: "4:59 → 0:01", rendered inline in the component using a format helper, no new i18n key needed for the timer format itself.

### 2. Searching screen: Share Invite Link (all game types)

Move the copy invite link button from "only multi-player Ludo" to **always visible during searching phase** — before cancel.

The link is `buildInviteLink({ roomId: createdRoomPda })`. For free rooms (`free-XXXX`), the canonical room link is already used correctly in `WaitingForOpponentPanel` — same here.

The share button becomes a WhatsApp-friendly share if `navigator.share` is available (mobile), or clipboard copy otherwise.

### 3. Searching screen: "Play vs AI while you wait" mini-card

A compact, clearly labeled card below the progress bar. It shows:
- The same game icon (so it feels relevant)
- Text: "Bored waiting? Play {{game}} vs AI for free — your room stays open!"  
- A button: "Play {{game}} vs AI →"

This uses `navigate()` to open the AI page in the SAME tab. When the opponent joins, the realtime alert fires `navigate(/play/${createdRoomPda})` — but if the user is already on the AI page, they won't see it. So the Play AI button opens a **new tab** (`window.open`), so the QuickMatch page stays alive in the background, the realtime listener keeps running, and the user gets a browser notification when the opponent joins.

The path mapping for "Play vs AI" uses the `selectedGameKey`:

```text
ludo      → /play-ai/ludo
dominos   → /play-ai/dominos
chess     → /play-ai/chess
backgammon→ /play-ai/backgammon
checkers  → /play-ai/checkers
```

### 4. "Room stays in Room List" messaging — on the timeout screen

When the 5-minute UI countdown reaches 0 and the timeout screen shows, add clear friendly text:

> "Your room is still open in the Room List for up to 15 minutes. Anyone can still find and join you!"

And a "View Room List" button that navigates to `/room-list` (so friends can also manually join).

This is the correct place for this message — the **timeout screen** is when users think the room has died and they need reassurance.

### 5. New i18n keys (added to all 10 locale files)

New keys needed in the `quickMatch` section:

```json
"playAIWhileWaiting": "Play {{game}} vs AI — your room stays open!",
"playAIWhileWaitingBtn": "Play vs AI (New Tab)",
"shareLink": "Share Room Link",
"shareOrCopy": "Copy or share your room link",
"roomStillOpen": "Your room is still listed for 15 min",
"roomStillOpenDesc": "Anyone searching for a {{game}} match can still join you! Open the Room List to share the link.",
"viewRoomList": "View Room List",
"timeLeft": "{{min}}:{{sec}}",
"waitingNote": "Waiting... your room is live 🟢"
```

These 9 new keys × 10 locales = 90 translations. The plan is to write all of them with proper native-language translations (not machine-translated placeholders):

- **en** — English (source)
- **hi** — Hindi (largest audience: India)
- **ar** — Arabic (RTL)
- **es** — Spanish
- **fr** — French
- **de** — German
- **pt** — Portuguese
- **zh** — Chinese (Simplified)
- **it** — Italian
- **ja** — Japanese

---

## Exact File Changes

### `src/pages/QuickMatch.tsx`

1. **Line 65**: `SEARCH_TIMEOUT_SEC = 60` → `SEARCH_TIMEOUT_SEC = 300`
2. **Add `formatTime` helper** near the top of the component:
   ```ts
   const formatTime = (secs: number) => {
     const m = Math.floor(secs / 60);
     const s = secs % 60;
     return `${m}:${s.toString().padStart(2, "0")}`;
   };
   ```
3. **Searching phase** (lines 613–684): Update to add 3 new elements:
   - Timer display: change `{t("quickMatch.secondsLeft", { seconds: secondsLeft })}` → `{formatTime(secondsLeft)}`
   - "Room still open" note below the progress bar: small green dot + `t("quickMatch.waitingNote")`
   - **Share link card**: copy/share button (visible for ALL game types, not just multi-player Ludo) — replaces the Ludo-only section with a universal one that works for everyone
   - **Play vs AI card**: card with game icon, description line, and "Play vs AI (New Tab)" button using `window.open(`/play-ai/${selectedGameKey}`, "_blank")`
4. **Timeout phase** (lines 687–714): Add below the "Keep Searching" button:
   - `t("quickMatch.roomStillOpenDesc")` info box
   - "View Room List" button → `navigate("/room-list")`

### `src/i18n/locales/en.json` (and 9 other locale files)

Add 9 new keys to the `quickMatch` section. Written professionally, fun, and simple — no jargon.

---

## What the Searching Screen Will Look Like

```text
╔════════════════════════════════╗
║  [Ludo icon — pulsing]         ║
║                                ║
║  🔍 Searching for opponent...  ║
║       4:32  ← mm:ss countdown  ║
║                                ║
║  [═══════════          ]       ║
║  🟢 Your room is live          ║
║                                ║
║  Ludo • Free                   ║
║                                ║
║ ┌──────────────────────────┐  ║
║ │ 🎮 Play Ludo vs AI       │  ║
║ │ Your room stays open!    │  ║
║ │ [Play vs AI (New Tab) →] │  ║
║ └──────────────────────────┘  ║
║                                ║
║ [🔗 Share Room Link]  ← always ║
║                                ║
║      [Cancel]                  ║
╚════════════════════════════════╝
```

## What the Timeout Screen Will Look Like

```text
╔════════════════════════════════╗
║  [Ludo icon — dim]             ║
║                                ║
║  No opponent found yet         ║
║                                ║
║  [🔍 Keep Searching]           ║
║                                ║
║ ┌──────────────────────────┐  ║
║ │ ✅ Room still open!      │  ║
║ │ Your room is in the Room │  ║
║ │ List for up to 15 min.   │  ║
║ │ [View Room List →]       │  ║
║ └──────────────────────────┘  ║
║                                ║
║  [🤖 Play vs AI (Free)]        ║
║  [Cancel / Recover Funds]      ║
╚════════════════════════════════╝
```

---

## Why Open AI in a New Tab?

The `useRoomRealtimeAlert` hook is alive in `QuickMatch.tsx`. If the user navigates away (same tab), the subscription dies and they miss the opponent joining. Opening the AI game in a **new tab** means:
- QuickMatch page stays alive in tab 1
- AI game plays in tab 2
- Browser notification fires when opponent joins
- User clicks notification → goes back to tab 1 → navigated to the game

This is the same pattern used by gaming platforms like Chess.com and Wordle when they suggest other activities while waiting.

---

## Files Touched

| File | Change |
|---|---|
| `src/pages/QuickMatch.tsx` | Timer extended to 300s; mm:ss format; share button universalized; Play AI card added; timeout screen gets room-still-open box |
| `src/i18n/locales/en.json` | 9 new keys in `quickMatch` section |
| `src/i18n/locales/hi.json` | Same 9 keys in Hindi |
| `src/i18n/locales/ar.json` | Same 9 keys in Arabic |
| `src/i18n/locales/es.json` | Same 9 keys in Spanish |
| `src/i18n/locales/fr.json` | Same 9 keys in French |
| `src/i18n/locales/de.json` | Same 9 keys in German |
| `src/i18n/locales/pt.json` | Same 9 keys in Portuguese |
| `src/i18n/locales/zh.json` | Same 9 keys in Chinese |
| `src/i18n/locales/it.json` | Same 9 keys in Italian |
| `src/i18n/locales/ja.json` | Same 9 keys in Japanese |

No database changes. No new edge functions. No new routes.
