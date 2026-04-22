

## Fix NHL ingest gap + harden all sports against partial-batch failures

Two safe additive fixes in one patch.

### Fix 1: Build error (unrelated but blocking deploys)

`src/components/CinematicChess3DScene.tsx` line 506 — R3F's `Camera` union type doesn't expose `fov`. Cast to `PerspectiveCamera` before assigning. One-line change.

### Fix 2: Sports ingest hardening (root cause of missing Canadiens game)

**File: `supabase/functions/polymarket-sync/index.ts`**

Three additive changes inside `daily_import`, applied uniformly to **all leagues** (not NHL-only):

**A. Per-league error visibility**
Replace the silent `try/catch` around each `fetchByLeagueSource` call with one that logs `[daily_import] league=<key> fetched=N accepted=M` on success and the full error stack on failure. No behaviour change — pure observability.

**B. Universal self-healing top-up**
After each batch's main loop completes, run a coverage check across **every league in that batch**:
```ts
for (const league of batch) {
  const { count } = await supabase
    .from("prediction_fights")
    .select("id", { count: "exact", head: true })
    .ilike("polymarket_slug", `${league.slugPrefix}-%`)
    .gte("event_date", new Date(Date.now() - 12*3600_000).toISOString())
    .lte("event_date", new Date(Date.now() + 72*3600_000).toISOString());
  if ((count ?? 0) < league.minExpected) {
    console.warn(`[daily_import] coverage gap league=${league.key} count=${count}, retrying`);
    await fetchByLeagueSource(league); // one retry only
  }
}
```
- `minExpected` defaults to **3** for all leagues (configurable per-league for off-season sports)
- Only one retry per batch run — no infinite loops, bounded CPU cost
- Runs sequentially after the main loop, never blocks other batches

**C. Manual admin trigger documentation**
The existing `action: "league_import", league_key: <key>` endpoint surface already supports per-league reimport. Confirm it works for all keys (`nhl`, `nba`, `mlb`, `nfl`, `ncaa`, soccer leagues, tennis, etc.) and add a one-line log so we can see it firing.

### Files changed (exact)

| File | Change |
|---|---|
| `src/components/CinematicChess3DScene.tsx` | Cast camera to `PerspectiveCamera` before reading/writing `fov` (line ~506) |
| `supabase/functions/polymarket-sync/index.ts` | Add per-league logging + universal coverage-gap retry inside `daily_import` for all batches |

### What is NOT touched
- `prediction-submit`, `prediction-confirm`, `prediction-claim`, `prediction-sell`
- Polymarket CLOB browser execution, Privy, Smart Wallet, fee relayer
- GoAffPro tracking, affiliate page, footer link
- Allowlist policy, visibility rules, fee policy, slippage thresholds
- Cron schedule cadence (still 4× daily, staggered batches)
- Operator ownership, payout, sweep, onboarding, purchase flows

### Risk

| Area | Risk | Mitigation |
|---|---|---|
| CPU budget | Low — at most 1 extra HTTP fetch per missing league per batch | Hard-gated by row count, sequential, fires at most once |
| Duplicate inserts | None — upsert is idempotent on `polymarket_slug` | Existing behaviour |
| Other batches | None — top-up runs inside the batch's own invocation | No cross-batch state |
| Logging cost | Negligible | One log line per league per run |
| Build | Fixes existing TS error, no new types | Type cast is the standard R3F pattern |

### Test plan

1. Deploy the patched function + frontend build
2. Verify TS build passes (no more `fov` error)
3. Manually invoke `daily_import batch=1`: `SELECT net.http_post(url:='https://mhtikjiticopicziepnj.supabase.co/functions/v1/polymarket-sync', body:='{"action":"daily_import","batch":1}'::jsonb, headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb)`
4. Watch edge logs for `[daily_import] league=nhl fetched=N accepted=M` lines for every league in batch 1
5. If NHL had a coverage gap, confirm `[daily_import] coverage gap league=nhl ... retrying` appears, followed by a successful refetch
6. Query DB: `SELECT polymarket_slug, title, event_date FROM prediction_fights WHERE polymarket_slug ILIKE 'nhl-%' AND event_date BETWEEN now() - interval '12 hours' AND now() + interval '72 hours' ORDER BY event_date` — confirm `nhl-mon-tb-2026-04-21` (Canadiens vs. Lightning) appears
7. Repeat queries for `nba-`, `mlb-`, `nfl-`, `epl-`, `ucl-`, `atp-` slugs — confirm each league has expected coverage
8. Open `1mg.live/{operator-slug}` → confirm Canadiens appears in NHL section, other sports unchanged
9. Wait 6 hours for next scheduled batch run, confirm logs stay clean and no top-up needed (steady state)

### Confirmation

This patch is 2 files, additive only. The NHL fix is a side effect of the universal hardening — every sport benefits from the same coverage-gap recovery. No checkout, auth, payout, or affiliate logic touched.

