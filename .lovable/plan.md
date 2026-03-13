

# Fix Plan: Auto-Settle, Weight Badge Visibility, Hero Image Position

## 1. Auto-Settle Was Never Scheduled (Root Cause)

The `pg_cron` extension was enabled in a migration, but **no cron job was ever created** to invoke the `prediction-auto-settle` edge function. The function exists and works, but nothing calls it.

**Fix:** Add a database migration that schedules a cron job to call `prediction-auto-settle` every minute via `pg_net`:

```sql
SELECT cron.schedule(
  'auto-settle-predictions',
  '* * * * *',
  $$ SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/prediction-auto-settle',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ); $$
);
```

> Note: Lovable Cloud may not support `current_setting('app.settings...')`. If that's the case, we'll hardcode the project URL and use the service role key from Vault, or use a simpler `net.http_post` with the known project URL.

## 2. Weight Class Badge Too Dark

In `FightCard.tsx` line 108, the weight class badge uses:
```
bg-accent/20 text-accent-foreground
```

On the dark theme, `accent-foreground` is very dark. 

**Fix:** Change to a brighter, visible color:
```
bg-yellow-500/15 text-yellow-300
```

## 3. Hero Background Image Needs to Show Fighters Higher

In `FightPredictions.tsx` line 277, the hero image uses `object-top`. The fighters are cut off at the bottom area.

**Fix:** Change from `object-top` to `object-center` so the fighters (mid-frame) are more visible:
```
object-cover object-[center_30%]
```
This shifts the focal point slightly up from dead center, showing more of the fighters.

## Summary of Changes

| File | Change |
|---|---|
| **New migration** | Schedule `cron.schedule('auto-settle-predictions', ...)` to invoke the edge function every minute |
| `src/components/predictions/FightCard.tsx` line 108 | Change weight badge from `bg-accent/20 text-accent-foreground` → `bg-yellow-500/15 text-yellow-300` |
| `src/pages/FightPredictions.tsx` line 277 | Change hero image from `object-top` → `object-[center_30%]` to show fighters higher |

