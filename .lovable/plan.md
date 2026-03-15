# Fight Prediction System — Phase 2 In Progress

## Status Lifecycle (Final)

```
open → locked → live → result_selected → confirmed → settled
                   └→ draw → refund_pending → refunds_processing → refunds_complete
                   └→ cancelled
```

## Architecture

### Database Tables
- `prediction_events` — Parent event grouping + automation fields (source_provider, source_event_id, automation_status, scheduling, result detection, confidence)
- `prediction_fights` — Individual fights with event_id FK, weight_class, fight_class, method, refund tracking
- `prediction_entries` — User prediction records
- `prediction_admins` — Authorized admin wallets
- `prediction_settings` — Global kill switches (predictions_enabled, claims_enabled, automation_enabled)
- `automation_jobs` — Scheduled/running automation tasks (job_type, target, status, retries, result_payload)
- `automation_logs` — Immutable audit trail (action, source, confidence, admin_wallet)

### Edge Functions
- `prediction-admin` — Full lifecycle + getSettings/updateSettings for kill switches
- `prediction-refund-worker` — Separate refund execution for draw scenarios (idempotent, safety-guarded)
- `prediction-submit` — Submit predictions with 5% fee (respects predictions_enabled kill switch)
- `prediction-claim` — Claim rewards (respects claims_enabled kill switch)
- `prediction-feed` — Live activity feed
- `prediction-auto-settle` — Cron auto-settle (respects automation_enabled kill switch)
- `prediction-ingest` — BALLDONTLIE MMA API event/fight discovery (UFC, Bellator, PFL, ONE). Fetches events via `/events?year=YYYY`, full fight cards via `/fights?event_ids[]=ID`. Auth via `Authorization: API_KEY` header. Supports full card import (main_card, prelims, early_prelims segments with fight_order). Fights endpoint requires ALL-STAR tier. Dedupes by `bdl_{id}`. Stores as draft. Never auto-publishes.
- `prediction-schedule-worker` — Cron: locks approved events at scheduled_lock_at, marks live at scheduled_live_at. Respects global + per-event automation_paused.
- `prediction-result-worker` — Cron: fetches results from TheSportsDB for live auto-resolve events. Requires exact source_event_id match. Records payload + confidence. Flags low-confidence (<85%) for admin review. Auto-moves high-confidence fights to result_selected (NOT confirmed).
- `prediction-settle-worker` — Idempotent job-based settlement. Creates jobs for confirmed fights past claims_open_at. CAS guard prevents double-pickup. Retry support (max 3). Full audit trail. Replaces simple auto-settle for new fights.

### Key Design Decisions
1. Draw declaration is separate from refund execution (draw → refund_pending → refunds_processing → refunds_complete)
2. `result_selected` is a real reversible status between `live` and `confirmed`
3. `settled` means financially closed and immutable
4. Events group fights; admin manages at event level
5. Result worker only moves to `result_selected`, never `confirmed` — admin must confirm
6. Settlement worker uses job table with CAS guards for exactly-once execution
7. All workers respect both global kill switch AND per-event automation_paused flag

### Safety Guardrails
- **Global kill switches**: predictions_enabled, claims_enabled, automation_enabled (enforced server-side)
- **Per-event pause**: automation_paused flag stops schedule/result/settle workers for individual events
- Server-side status guards on all transitions
- Red confirmation dialogs for irreversible actions (lock, confirm, settle, draw, refunds)
- Per-claim cap: 5 SOL, daily ceiling: 50 SOL
- 5-minute safety delay before claims open
- Refund tracking: refund_status, refunds_started_at, refunds_completed_at
- Manual admin actions (settle, lock, etc.) always work regardless of kill switches
- Settlement idempotency via automation_jobs deduplication
- CAS (Compare-And-Swap) guards on job pickup prevent double-processing

---

## Phase 3 (Next): Cron Scheduling
Set up pg_cron jobs for schedule-worker, result-worker, and settle-worker.

## Phase 4 (Next): Admin UI for Automation Monitoring
Dashboard showing automation_jobs status, failed jobs, retry counts, audit logs.
