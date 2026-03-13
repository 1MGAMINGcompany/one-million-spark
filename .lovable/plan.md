

# Phase 1 — Revised Plan (with user's 5 edits applied)

## Summary of Changes from Original Plan

All 5 requested edits are incorporated:
1. Draw declaration separated from refund execution (state machine: `draw` → `refund_pending` → `refunds_processing` → `refunds_complete`)
2. `result_selected` added as a real status between `live` and `confirmed`
3. `settled` clearly defined as "financially closed, immutable"
4. `prediction_events` parent table added for event-level grouping
5. `review_required` + `review_reason` fields added for future automation

---

## Final Status Lifecycle

```text
open → locked → live → result_selected → confirmed → settled
                   └→ draw → refund_pending → refunds_processing → refunds_complete
                   └→ cancelled
```

- **open** — predictions accepted
- **locked** — no new predictions
- **live** — fight in progress
- **result_selected** — admin picked winner (reversible)
- **confirmed** — result finalized, 5-min timer starts
- **settled** — claims open, event financially closed, immutable
- **draw** — declared draw, awaiting refund
- **refund_pending** — draw confirmed, refunds queued
- **refunds_processing** — refund worker running
- **refunds_complete** — all refunds sent, event closed
- **cancelled** — event cancelled

---

## Database Changes

### New table: `prediction_events`
```
id uuid PK
event_name text NOT NULL
organization text
event_date timestamptz
location text
source text DEFAULT 'manual'
source_url text
status text DEFAULT 'draft' (draft/approved/rejected/completed)
auto_resolve boolean DEFAULT false
is_test boolean DEFAULT false
review_required boolean DEFAULT false
review_reason text
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```
RLS: public read, deny client writes.

### Alter `prediction_fights`
Add columns:
- `event_id uuid REFERENCES prediction_events(id)` — nullable for backward compat
- `weight_class text`
- `fight_class text`
- `method text` — KO, TKO, Decision, etc.
- `confirmed_at timestamptz`
- `settled_at timestamptz`
- `refund_status text DEFAULT null` — null / pending / processing / complete / failed
- `refunds_started_at timestamptz`
- `refunds_completed_at timestamptz`
- `review_required boolean DEFAULT false`
- `review_reason text`
- `auto_resolve boolean DEFAULT false`
- `source text DEFAULT 'manual'`

### Seed data
- Insert 1 `prediction_events` row for "Silvertooth Promotions — Montreal" with `auto_resolve: false`
- Insert 3 test `prediction_events` (BOXING, MMA, MUAY THAI) with `is_test: true`
- Link existing fights to the Silvertooth event via `event_id`
- Insert test fights under each test event

---

## Edge Function: `prediction-admin/index.ts` — New Actions

Current actions (keep): `createFight`, `lockPredictions`, `resolveFight` (rename to `selectResult`)

New actions:
| Action | From Status | To Status | Notes |
|--------|------------|-----------|-------|
| `createEvent` | — | draft | Creates prediction_events row |
| `approveEvent` | draft | approved | Makes event fights visible |
| `rejectEvent` | draft | rejected | Hides event |
| `createFight` | — | open | Now accepts optional `event_id` |
| `markLive` | locked | live | — |
| `selectResult` | live | result_selected | Sets winner, reversible |
| `setMethod` | result_selected | result_selected | Sets method (KO/TKO/Decision) |
| `confirmResult` | result_selected | confirmed | Sets `confirmed_at`, starts 5-min timer, sets `claims_open_at` |
| `settleEvent` | confirmed (after timer) | settled | Sets `settled_at`, claims now open, immutable |
| `declareDraw` | live or result_selected | draw | Only changes status, does NOT trigger refunds |
| `startRefunds` | draw | refund_pending | Queues refund processing |
| `deleteTestEvent` | any (is_test=true) | — | Deletes test event + its fights |

### Refund flow (separate from draw)
- `declareDraw` → status = `draw`
- `startRefunds` → status = `refund_pending`
- New edge function `prediction-refund-worker/index.ts`:
  - Called manually by admin or scheduled
  - Sets status to `refunds_processing`
  - Iterates entries, sends `pool_lamports` back per entry
  - On success: sets `refund_status = 'complete'`, status = `refunds_complete`
  - On partial failure: sets `refund_status = 'failed'`, logs which entries failed
  - Platform fee NOT refunded

### Safety confirmations (all enforced server-side)
- Cannot `markLive` unless status is `locked`
- Cannot `selectResult` unless status is `live`
- Cannot `confirmResult` unless status is `result_selected`
- Cannot `settleEvent` unless status is `confirmed`
- Cannot `declareDraw` unless status is `live` or `result_selected`
- Cannot `startRefunds` unless status is `draw`

---

## Admin UI: `FightPredictionAdmin.tsx` — Full Rebuild

Mobile-first operator interface with:
- **Events section**: List of `prediction_events`, grouped. Each shows name, date, org, fight count. Buttons: Approve / Reject / Delete (test only)
- **Per-fight cards** with large stacked buttons in order:
  1. Lock Predictions
  2. Mark Live
  3. Fighter A Won / Fighter B Won / Draw-No Contest
  4. Add Method (dropdown: KO, TKO, Decision, Submission, DQ)
  5. Confirm Result
  6. Settle Event
  7. Start Refunds (only shows for draw status)
- Impossible actions are disabled based on current status
- Red confirmation dialogs before: Lock, Confirm Result, Settle, Declare Draw, Start Refunds
- Status badge prominently displayed on each card
- `review_required` fights highlighted with a yellow review banner
- Create Event form (name, org, date, location)
- Create Fight form (now includes event_id dropdown, weight_class, fight_class)

---

## FightCard.tsx — Updated Status Badges

Display all statuses: OPEN, LOCKED, LIVE, RESULT SELECTED, CONFIRMED, SETTLED, DRAW, REFUNDING

---

## FightPredictions.tsx — Event Grouping

- Fetch `prediction_events` alongside fights
- Group fights by `event_id` in the UI
- EventSection headers show event name, date, organization
- Fights without an `event_id` grouped under "Ungrouped"

---

## New Edge Function: `prediction-refund-worker/index.ts`

Handles draw refund payouts separately from status changes:
- Accepts `fight_id`
- Validates status is `refund_pending`
- Sets status to `refunds_processing`
- Iterates all entries for that fight
- Sends `pool_lamports` back to each wallet (same safety guardrails as claim: 5 SOL per-tx cap, 50 SOL daily ceiling)
- Marks entries with `refunded = true`
- On completion: status = `refunds_complete`, `refunds_completed_at = now()`
- On failure: status stays `refunds_processing`, `refund_status = 'failed'`

---

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Create `prediction_events`, alter `prediction_fights` with new columns |
| Data insert | Seed Silvertooth event, 3 test events with fights, link existing fights |
| `supabase/functions/prediction-admin/index.ts` | Add all new actions, rename resolveFight → selectResult |
| `supabase/functions/prediction-refund-worker/index.ts` | New — separate refund execution |
| `src/pages/FightPredictionAdmin.tsx` | Full rebuild — event management + sequential fight controls + safety dialogs |
| `src/components/predictions/FightCard.tsx` | Updated status badges |
| `src/pages/FightPredictions.tsx` | Fetch events, group fights by event |

