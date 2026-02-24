

# Part 1: `crypto.randomUUID` Polyfill

## The Problem

23 users hit a crash: `crypto.randomUUID is not a function`. This function was only added to browsers in 2022 -- older Android WebViews, Samsung Internet, and in-app wallet browsers (like Phantom's built-in browser) often lack it. When it fails, the app can't generate session IDs for presence tracking or game sync, causing a **blank white screen**.

Three files call `crypto.randomUUID()`:
- `src/lib/anonIdentity.ts` -- anonymous player IDs
- `src/hooks/usePresenceHeartbeat.ts` -- live visitor tracking
- `src/hooks/useDurableGameSync.ts` -- game state sync

## The Fix

Add a UUID v4 polyfill to `src/polyfills.ts` (which already runs before all other code). If `crypto.randomUUID` is missing, patch it using `crypto.getRandomValues` which has near-universal support. No other files change -- all three call sites just work.

### File: `src/polyfills.ts`

Append after the existing Buffer/process polyfills:

```typescript
// Polyfill crypto.randomUUID for older browsers / in-app wallets
if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function") {
  (globalThis.crypto as any).randomUUID = (): string => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
    const h = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
}
```

---

# Part 2: Stale Room Cleanup

## The Problem

There are **20+ rooms stuck in "waiting" status**, some from **11 days ago** (Feb 13). The existing timeout function (`maybe_apply_waiting_timeout`) works correctly -- it cancels rooms after 15 minutes -- but it **only runs when someone actively polls that specific room** via `game-session-get`. If a player creates a room and walks away, nobody ever polls it, so it sits in "waiting" forever.

This matters because:
- **Paid rooms** (ranked/casual) have SOL locked in an on-chain vault that never gets refunded
- **Free rooms** clutter the room list, making the platform look dead with stale lobbies
- The "rooms waiting" live stat is inflated with ghost rooms

## The Fix

Create a new edge function `cleanup-stale-rooms` that bulk-processes all stale waiting rooms. Trigger it on a schedule via `pg_cron` (every 5 minutes).

### New file: `supabase/functions/cleanup-stale-rooms/index.ts`

Logic:
1. Query all `game_sessions` where `status_int = 1` (waiting) AND `player2_wallet IS NULL`
2. For each, check if it's past the timeout threshold:
   - **Free rooms**: 30 minutes (generous -- free rooms have no financial risk)
   - **Paid rooms** (ranked/casual/private): 15 minutes (matches existing `maybe_apply_waiting_timeout`)
3. **Free rooms**: Bulk UPDATE to `status_int = 5` (cancelled)
4. **Paid rooms**: UPDATE to cancelled, then call `sweep-orphan-vault` internally to refund the creator's SOL from the on-chain vault

### Config: `supabase/config.toml`

Add entry for the new function:
```
[functions.cleanup-stale-rooms]
verify_jwt = false
```

### Database: pg_cron schedule

Enable `pg_cron` and `pg_net` extensions, then schedule:

```sql
SELECT cron.schedule(
  'cleanup-stale-rooms',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://mhtikjiticopicziepnj.supabase.co/functions/v1/cleanup-stale-rooms',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
       body := '{"source":"cron"}'::jsonb
     ) AS request_id; $$
);
```

### Immediate one-time cleanup

Run a SQL migration to cancel the existing 20+ stale rooms right now:
- Free rooms: set `status_int = 5`, `status = 'cancelled'`
- Paid rooms: same DB update, then the edge function's first run will attempt vault sweeps for any that have on-chain funds

## Summary of all changes

| File | Change |
|------|--------|
| `src/polyfills.ts` | Add `crypto.randomUUID` polyfill |
| `supabase/functions/cleanup-stale-rooms/index.ts` | New scheduled cleanup function |
| `supabase/config.toml` | Register new function |
| SQL migration | Enable pg_cron, schedule job, cancel existing stale rooms |

