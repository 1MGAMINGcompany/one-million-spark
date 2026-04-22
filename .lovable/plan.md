

## Fix missing same-team NBA games in operator apps + verify sports sync health

### Audit findings

- The sports sync is running: latest `daily_auto_import` logs show Batch 1 ran today and processed NBA, NHL, MLB, tennis, cricket, etc.
- NBA is being fetched correctly from the upstream source:
  - `browse_league nba` currently returns **23 raw NBA events**
  - **20 NBA events pass filters**
  - Today’s **Magic vs. Pistons** event is accepted by the filter
- The likely bug is in import deduplication:
  - `polymarket-sync` has a **global title-only duplicate check**
  - Repeated matchups like `Magic vs. Pistons`, `Lakers vs. Rockets`, `Celtics vs. 76ers`, etc. can happen on multiple dates
  - The current title-only check can incorrectly skip a new game because an older game with the same title already exists
- Other sports are updating:
  - Recent live/upcoming DB counts show active coverage for MLB, NHL, NBA, ATP/WTA tennis, cricket, soccer, rugby, etc.
  - Off-season/empty leagues like NFL or some niche cricket/table-tennis sources can correctly show zero if upstream has no active fixtures

### Root cause

The importer treats identical titles as duplicates globally:

```ts
title = "Magic vs. Pistons"
```

That is unsafe for sports schedules because the same teams can play again on a different date.

The safer duplicate keys are:
- Polymarket condition ID
- Polymarket market ID
- Normalized teams + same event date

Those already exist in the importer. The broad title-only dedup should be removed or narrowed.

---

## Patch

### File 1: `supabase/functions/polymarket-sync/index.ts`

#### Change 1: Remove unsafe global title-only dedup

Remove or replace this logic:

```ts
.filter("title", "ilike", candidateTitle)
.limit(1)
```

because it can skip valid same-team games on different dates.

#### Change 2: Keep safe dedup checks intact

Keep these existing checks unchanged:

- `polymarket_condition_id`
- `polymarket_market_id`
- normalized team names + same event date

This still prevents real duplicates while allowing repeat matchups on new dates.

#### Change 3: Add sport/date-aware logging when a duplicate is skipped

Add log messages for skipped duplicates so future audits show whether a game was skipped because of:

- same condition ID
- same market ID
- same teams on same date

Example:

```ts
console.log(
  `[polymarket-sync] duplicate skipped reason=same_matchup_date title="${candidateTitle}" date=${dateStr}`
);
```

#### Change 4: Add NBA repair/backfill path using existing import flow

After deployment, run the existing NBA import flow once:

```json
{ "action": "daily_import", "batch": 1 }
```

or:

```json
{ "action": "league_import", "league_key": "nba" }
```

depending on the currently supported deployed action names.

This should backfill today’s missing NBA games, including Magic vs. Pistons, without changing checkout, wallets, payouts, or operator logic.

---

## Verification

### Database checks

Confirm today/upcoming NBA events include same-title repeat matchups:

```sql
select title, polymarket_slug, event_date, status, visibility, polymarket_active
from prediction_fights
where polymarket_slug ilike 'nba-%'
  and event_date between now() - interval '12 hours' and now() + interval '96 hours'
order by event_date asc;
```

Confirm Magic vs. Pistons exists specifically:

```sql
select title, polymarket_slug, event_date, status, visibility, polymarket_active
from prediction_fights
where polymarket_slug ilike 'nba-%'
  and (
    title ilike '%Magic%'
    or title ilike '%Pistons%'
    or polymarket_slug ilike '%orl%'
    or polymarket_slug ilike '%det%'
  )
order by event_date asc;
```

### Sports health checks

Check upcoming active events by sport prefix:

```sql
select
  lower(split_part(polymarket_slug, '-', 1)) as prefix,
  count(*) as count,
  min(event_date) as next_event,
  max(polymarket_last_synced_at) as last_sync
from prediction_fights
where event_date >= now() - interval '12 hours'
  and event_date <= now() + interval '72 hours'
  and status in ('open','live','locked')
  and polymarket_active is not false
group by 1
order by count desc;
```

### Operator app checks

- Open an operator app at `1mg.live/{slug}`
- Confirm NBA appears if NBA is enabled for that operator
- Confirm Magic vs. Pistons appears under NBA / Basketball
- Confirm NHL, MLB, tennis, cricket, and soccer sections still render normally
- Confirm disabled sports remain hidden per operator settings

---

## Files changed

| File | Change |
|---|---|
| `supabase/functions/polymarket-sync/index.ts` | Remove unsafe title-only dedup, keep safe market/condition/date dedup, add duplicate reason logging |

---

## What will not be touched

- Checkout
- Privy
- Wallet creation
- Operator ownership
- Payouts
- GoAffPro
- Operator onboarding
- Trade submission
- Trade confirmation
- User betting UI logic
- Operator settings logic

---

## Risk check

| Risk | Level | Mitigation |
|---|---:|---|
| Duplicate events | Low | Existing condition ID, market ID, and same-date matchup checks remain |
| Missing repeat matchups | Fixed | Same title on different dates will now import correctly |
| Other sports affected | Positive | Fix applies to all sports with repeat team/player matchups |
| Checkout/auth/payout regression | None | Only importer dedup logic changes |
| Data volume increase | Low | Only legitimate new dated fixtures are added |

