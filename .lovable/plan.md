

# Fix Quick Match: Translations + Stale Rooms Bug

## Problems Found

### 1. Hardcoded English strings (5 instances)
Several user-facing strings in QuickMatch.tsx are not going through the translation system.

### 2. Game names not translated
`selectedGameName` uses the hardcoded `label` field from `GAME_OPTIONS` (e.g. "Chess") instead of the translated `t("games.chess")` key. Non-English users see English game names.

### 3. Stale rooms bug (functional issue)
In `handleFindMatch`, `fetchRooms()` is called, but the `rooms` state variable used on the next line still holds the *previous* value (React state doesn't update mid-function). The match search always runs against stale data, meaning it may miss a room that just appeared or try to match against a room that no longer exists.

### 4. Unused import
`isOpenStatus` is imported but never referenced.

## Changes

### File: `src/pages/QuickMatch.tsx`

**A. Fix stale rooms bug**
- Change `fetchRooms()` to return the fresh rooms array directly (or use a ref)
- Since `fetchRooms` from `useSolanaRooms` updates state but doesn't return data, the fix is to search using a `roomsRef` that's kept in sync, or better: call `fetchRooms()`, then use a small timeout/await pattern. The cleanest approach: store `rooms` in a ref that's always current, and read from the ref after `await fetchRooms()`.

```text
const roomsRef = useRef(rooms);
roomsRef.current = rooms;

// In handleFindMatch, after fetchRooms():
await fetchRooms();
// Small delay to let state settle, then read from ref
await new Promise(r => setTimeout(r, 100));
const currentRooms = roomsRef.current;
const match = currentRooms.find(...)
```

**B. Translate hardcoded strings**

Add missing keys to all 10 locale files:
- `quickMatch.opponentJoined`: "Opponent Joined!" (for browser notification title)
- `quickMatch.matchReady`: "Your {{game}} match is ready!" (notification body)
- `quickMatch.letsGo`: "{{game}} -- Let's go!" (toast description)
- `quickMatch.error`: "Error"
- `quickMatch.somethingWrong`: "Something went wrong"

Replace hardcoded strings in the component:
- Line 112: use `t("quickMatch.opponentJoined")` and `t("quickMatch.matchReady", { game: translatedGameName })`
- Line 115: use `t("quickMatch.letsGo", { game: translatedGameName })`
- Line 230: use `t("quickMatch.error")`
- Line 231: use `t("quickMatch.somethingWrong")`

**C. Translate game names**

Replace usage of `selectedGameName` (hardcoded English) with a translated version:
```text
const translatedGameName = t(`games.${selectedGameKey}`);
```

Use `translatedGameName` everywhere `selectedGameName` was used in user-facing text. Keep `selectedGameKey` for the edge function call (which needs the English key).

**D. Remove unused import**

Remove `isOpenStatus` from the import line.

### Files: All 10 locale JSON files

Add 3 new keys to the `quickMatch` section in each:

| Key | en | es | ar | pt | fr | de | zh | it | ja | hi |
|---|---|---|---|---|---|---|---|---|---|---|
| opponentJoined | Opponent Joined! | Oponente encontrado! | انضم الخصم! | Oponente encontrado! | Adversaire trouve! | Gegner gefunden! | 对手加入! | Avversario trovato! | 対戦相手が参加! | प्रतिद्वंद्वी मिला! |
| matchReady | Your {{game}} match is ready! | Tu partida de {{game}} esta lista! | مباراة {{game}} جاهزة! | Sua partida de {{game}} esta pronta! | Votre match de {{game}} est pret! | Dein {{game}}-Match ist bereit! | 你的{{game}}比赛准备好了! | La tua partita di {{game}} e pronta! | {{game}}の対戦準備完了! | आपका {{game}} मैच तैयार है! |
| letsGo | {{game}} -- Let's go! | {{game}} -- Vamos! | {{game}} -- هيا بنا! | {{game}} -- Vamos! | {{game}} -- C'est parti! | {{game}} -- Los geht's! | {{game}} -- 开始吧! | {{game}} -- Andiamo! | {{game}} -- 始めよう! | {{game}} -- चलो शुरू करें! |
| error | Error | Error | خطأ | Erro | Erreur | Fehler | 错误 | Errore | エラー | त्रुटि |
| somethingWrong | Something went wrong | Algo salio mal | حدث خطأ | Algo deu errado | Une erreur est survenue | Etwas ist schiefgelaufen | 出错了 | Qualcosa e andato storto | エラーが発生しました | कुछ गलत हो गया |

## Files Modified

| File | Change |
|---|---|
| `src/pages/QuickMatch.tsx` | Fix stale rooms ref, translate all hardcoded strings, translate game names, remove unused import |
| `src/i18n/locales/*.json` (10 files) | Add 5 new keys to `quickMatch` section |

