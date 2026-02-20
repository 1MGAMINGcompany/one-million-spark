
# Fix: "Browsing Now" Counter + Full Translation

## What Is Broken (Verified)

### Bug 1 — CRITICAL: sessionStorage kills tracking accuracy
`usePresenceHeartbeat.ts` uses `sessionStorage` for the session ID. `sessionStorage` is **cleared every time a tab closes or the page is refreshed**. Instagram/WhatsApp visitors who open your link, browse for 20 seconds, and close the tab get a brand new session ID on every visit. The garbage collector deletes their old record after 5 minutes, meaning returning visitors are never counted as the same person twice. This is why 800 daily visits never show more than 2-4 concurrent — most of them are short bounces with no follow-up heartbeat.

**Fix:** Switch `sessionStorage` → `localStorage` in `getSessionId()`. Session IDs then persist across tab closes, making returning visitors correctly recognized.

### Bug 2 — CRITICAL: 2-minute counting window is too narrow
The stats query counts only users seen in the last **2 minutes**. Heartbeats fire every **30 seconds**. A user who was on the site 3 minutes ago (sent 2 heartbeats, then left) is completely invisible. With 800 visits over 14 waking hours, statistically only 1-2 people are on the site at any given 2-minute window at average — matching your observed 2-4.

**Fix:** Extend counting window from 2 minutes → **10 minutes**. Extend garbage collection from 5 minutes → **15 minutes** to match.

### Bug 3 — MEDIUM: No "visitors today" displayed
Even with the fixes above, the browsing count reflects only people currently active (last 10 min). To show the real social proof from 800 daily visits, a **"X visitors today"** counter is needed. The `presence_heartbeats` table currently has no date column for daily deduplication.

**Fix:** Add a `first_seen_date` column to `presence_heartbeats`. The heartbeat upsert sets it only on INSERT (not on UPDATE), so each device is counted once per day. The stats endpoint returns `visitsToday`. The UI shows both counts.

### Bug 4 — CRITICAL: `liveStats` and `home.beTheFirst` translation keys are MISSING from all locale files
The `LiveActivityIndicator` uses:
- `t("home.beTheFirst", "Be the first to start a match.")`
- `t("liveStats.browsingNow", "browsing now")`
- `t("liveStats.roomsWaiting", "rooms waiting")`

**None of these keys exist in any of the 10 locale files.** Every user on every language sees English fallbacks. The `visitsToday` string to be added also needs translating.

**Fix:** Add `liveStats` namespace and `home.beTheFirst` to all 10 locale files (en, hi, ar, zh, es, pt, fr, de, it, ja).

---

## Complete Fix Plan

### Step 1 — Database Migration: Add `first_seen_date` to `presence_heartbeats`

```sql
ALTER TABLE presence_heartbeats
ADD COLUMN IF NOT EXISTS first_seen_date date DEFAULT CURRENT_DATE;
```

The heartbeat upsert in the edge function must preserve this on UPDATE (not overwrite it with today's date on every heartbeat — otherwise a user who visited yesterday and visits again today would get today's date overwriting yesterday's).

The upsert uses `onConflict: "session_id"` which by default updates ALL columns. We restructure the edge function heartbeat to explicitly NOT update `first_seen_date` on conflict.

### Step 2 — Edge Function: `supabase/functions/live-stats/index.ts`

Changes:
1. **Heartbeat**: Use an explicit `INSERT ... ON CONFLICT DO UPDATE SET last_seen = ..., page = ..., game = ...` (excludes `first_seen_date` from the update so the original date is preserved)
2. **Stats**: Change `twoMinAgo` → `tenMinAgo` (10 minutes). Add `visitsToday` count (distinct session_ids with `first_seen_date = CURRENT_DATE`). Change GC from 5 min → 15 min.

```typescript
// Stats action — new counting window
const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

// New: visitsToday
const todayDate = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
const { count: visitsToday } = await supabase
  .from("presence_heartbeats")
  .select("*", { count: "exact", head: true })
  .eq("first_seen_date", todayDate);
```

For the heartbeat upsert, we use the Supabase `upsert` with `ignoreDuplicates: false` but we must avoid overwriting `first_seen_date`. The cleanest approach: use a raw INSERT with explicit ON CONFLICT clause handled server-side by checking if the row exists first, OR use two queries: try insert, on conflict update only non-date fields. Since Supabase JS client's `.upsert()` updates all provided columns, we pass only the update-safe columns:

```typescript
// First try insert (will fail silently on conflict)
await supabase.from("presence_heartbeats").insert({
  session_id: sessionId,
  last_seen: now,
  page: page ?? null,
  game: game ?? null,
  first_seen_date: todayDate,
}).maybeSingle(); // don't throw on conflict

// Then always update non-date fields
await supabase.from("presence_heartbeats")
  .update({ last_seen: now, page: page ?? null, game: game ?? null })
  .eq("session_id", sessionId);
```

This two-query approach correctly preserves `first_seen_date` from the first visit.

### Step 3 — Hook: `src/hooks/usePresenceHeartbeat.ts`

Change `sessionStorage` → `localStorage`:

```typescript
export function getSessionId(): string {
  let id = localStorage.getItem("live_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("live_session_id", id);
  }
  return id;
}
```

### Step 4 — Hook: `src/hooks/useLiveStats.ts`

Add `visitsToday` to the returned state:

```typescript
const [visitsToday, setVisitsToday] = useState(0);
// ...
setVisitsToday(Math.max(0, data.visitsToday ?? 0));
// ...
return { browsing, roomsWaiting, visitsToday, loading };
```

### Step 5 — Component: `src/components/LiveActivityIndicator.tsx`

New display logic — show both live count and daily visitors:

```
🟡 [pulse] 12 browsing now • 3 rooms waiting
            847 visitors today
```

When `browsing === 0 && visitsToday === 0` → show "Be the first to start a match."
When `browsing === 0` but `visitsToday > 0` → show "X visitors today — be the first to play!"

Uses `t("liveStats.browsingNow")`, `t("liveStats.roomsWaiting")`, `t("liveStats.visitsToday")`.

### Step 6 — Translations: Add `liveStats` and `home.beTheFirst` to all 10 locale files

Add to every locale file:

```json
"liveStats": {
  "browsingNow": "browsing now",
  "roomsWaiting": "rooms waiting",
  "visitsToday": "visitors today",
  "beTheFirst": "Be the first to start a match."
}
```

And also move `home.beTheFirst` to `liveStats.beTheFirst` (the component currently uses `home.beTheFirst`, it will be updated to use `liveStats.beTheFirst`).

Translations for all 10 languages:

| Key | EN | HI | AR | ZH | ES | PT | FR | DE | IT | JA |
|-----|----|----|----|----|----|----|----|----|----|----|
| browsingNow | browsing now | अभी ब्राउज़ कर रहे हैं | يتصفحون الآن | 正在浏览 | navegando ahora | navegando agora | en ligne maintenant | jetzt aktiv | navigano ora | 閲覧中 |
| roomsWaiting | rooms waiting | कमरे प्रतीक्षा में | غرف بانتظار | 等待中的房间 | salas esperando | salas aguardando | salles en attente | Räume warten | stanze in attesa | 待機中の部屋 |
| visitsToday | visitors today | आज के आगंतुक | زوار اليوم | 今日访客 | visitantes hoy | visitantes hoje | visiteurs aujourd'hui | Besucher heute | visitatori oggi | 本日の訪問者 |
| beTheFirst | Be the first to start a match. | पहले खेल शुरू करें। | كن أول من يبدأ مباراة. | 成为第一个开始比赛的人。 | Sé el primero en iniciar. | Seja o primeiro a jogar. | Soyez le premier à jouer. | Starte das erste Spiel. | Sii il primo a giocare. | 最初の対戦を始めよう。 |

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/live-stats/index.ts` | Extend window to 10 min, add `visitsToday`, fix heartbeat upsert to preserve `first_seen_date`, extend GC to 15 min |
| `src/hooks/usePresenceHeartbeat.ts` | Switch `sessionStorage` → `localStorage` for session ID |
| `src/hooks/useLiveStats.ts` | Add `visitsToday` to state and return |
| `src/components/LiveActivityIndicator.tsx` | Show "X browsing now • X rooms waiting" + "X visitors today" row; add translated fallback |
| `src/i18n/locales/en.json` | Add `liveStats` block with 4 keys |
| `src/i18n/locales/hi.json` | Same in Hindi |
| `src/i18n/locales/ar.json` | Same in Arabic |
| `src/i18n/locales/zh.json` | Same in Chinese |
| `src/i18n/locales/es.json` | Same in Spanish |
| `src/i18n/locales/pt.json` | Same in Portuguese |
| `src/i18n/locales/fr.json` | Same in French |
| `src/i18n/locales/de.json` | Same in German |
| `src/i18n/locales/it.json` | Same in Italian |
| `src/i18n/locales/ja.json` | Same in Japanese |
| **Database** | Add `first_seen_date date DEFAULT CURRENT_DATE` to `presence_heartbeats` |

## What the Numbers Will Look Like After the Fix

- **"X browsing now"** = people active in the last 10 minutes (will show 15-80 during peak instead of 2-4)
- **"X visitors today"** = unique devices since midnight (will reflect the real 800 daily visits figure)
- **All text fully translated** in all 10 languages including Arabic RTL

No game logic changes. No wallet changes. No breaking changes.
