

## Full Website Audit Report and Fix Plan

### 1. QuickMatch AI Overlay — PASS
The overlay implementation is correct:
- `showAIGame` state toggles a fixed z-50 overlay (lines 810-830)
- Both "Play vs AI" buttons (searching phase line 680, timeout phase line 767) call `setShowAIGame(true)` — no navigation away
- "Back to Matchmaking" button dismisses the overlay with `setShowAIGame(false)`
- Timer stays visible in the overlay header when phase is "searching"
- All `navigate(-1)` calls have been successfully removed (confirmed by search — zero matches)
- `backToMatchmaking` key is present in all 10 locale files

### 2. Free Room Rejoin — PASS
Room.tsx now has:
- `isFreeRoom` guard (line 145)
- PDA validation skip for `free-` prefix (lines 154-158)
- DB session hydration for free rooms (lines 206-226)
- `fetchRoom` early return for free rooms (line 294)
- Realtime subscription skip for free rooms (line 437)

### 3. Chat Panel — PASS
GameChatPanel is integrated in all 5 multiplayer game pages (Chess, Dominos, Backgammon, Checkers, Ludo). It uses a Sheet component (slide-in drawer) that can be opened/closed via a message icon button.

### 4. Translations — PASS
All recent keys (`backToMatchmaking`, `playAIWhileWaitingBtn`) are present across all 10 locales (en, es, fr, de, zh, pt, hi, ja, ar, it).

---

### 5. "Download App" Button — BUG FOUND

**Root cause**: The `MobileAppPrompt` component's "Download" button does absolutely nothing. It calls `e.preventDefault()` and then `handleDismiss()` — it just closes the prompt. There is a `// TODO: Replace with actual app store links` comment in the code.

The project has a `site.webmanifest` configured for PWA but **no PWA service worker** is set up (`vite-plugin-pwa` is not installed, and no `beforeinstallprompt` event handling exists anywhere in the codebase). This means the browser's "Add to Home Screen" prompt is never captured.

**Fix**: Rewrite `MobileAppPrompt` to use the browser's native PWA install prompt (`beforeinstallprompt` event). This captures the install event, stores it, and triggers it when the user clicks "Download". On iOS Safari (which doesn't support `beforeinstallprompt`), show manual instructions ("Tap Share then Add to Home Screen").

**File: `src/components/MobileAppPrompt.tsx`**

Changes:
- Add a `useEffect` that listens for the `beforeinstallprompt` event and stores the deferred prompt
- On "Download" click, call `deferredPrompt.prompt()` to trigger the native browser install dialog
- On iOS (no `beforeinstallprompt` support), show a tooltip/toast with manual instructions: "Tap the Share button, then 'Add to Home Screen'"
- Add `appinstalled` event listener to auto-dismiss after successful install
- Localize the text using `t()` calls with new translation keys

**New translation keys (all 10 locale files)**:
- `mobilePrompt.getTheApp` — "Get the App"
- `mobilePrompt.downloadDesc` — "Install 1M Gaming for the best experience"
- `mobilePrompt.install` — "Install"
- `mobilePrompt.iosInstructions` — "Tap the Share button, then 'Add to Home Screen'"

---

### Files to Change

| File | Action | What |
|---|---|---|
| `src/components/MobileAppPrompt.tsx` | Modify | Implement `beforeinstallprompt` PWA install flow with iOS fallback |
| `src/i18n/locales/en.json` | Modify | Add 4 new `mobilePrompt.*` keys |
| `src/i18n/locales/ar.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/es.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/fr.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/de.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/zh.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/pt.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/hi.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/ja.json` | Modify | Add 4 translated keys |
| `src/i18n/locales/it.json` | Modify | Add 4 translated keys |

### Summary

Everything else passes the audit. The only actionable bug is the non-functional "Download App" button, which needs the `beforeinstallprompt` PWA install flow plus iOS Safari fallback instructions.

