# Fight Prediction System — Phase 3 Complete

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
- `prediction-admin` — Full lifecycle + getSettings/updateSettings for kill switches. **approveEvent now sets auto_resolve: true + automation_status: scheduled**
- `prediction-refund-worker` — Separate refund execution for draw scenarios (idempotent, safety-guarded)
- `prediction-submit` — Submit predictions with 5% fee (respects predictions_enabled kill switch)
- `prediction-claim` — Claim rewards (respects claims_enabled kill switch)
- `prediction-feed` — Live activity feed
- `prediction-auto-settle` — Cron auto-settle (respects automation_enabled kill switch)
- `prediction-ingest` — Multi-provider API event/fight discovery
- `prediction-schedule-worker` — Cron (every 1 min): locks approved events at scheduled_lock_at, marks live at scheduled_live_at
- `prediction-result-worker` — Cron (every 2 min): fetches results from APIs for live auto-resolve events
- `prediction-settle-worker` — Cron (every 1 min): idempotent job-based settlement

### Cron Jobs (Active)
| Job ID | Name | Schedule | Function |
|--------|------|----------|----------|
| 2 | prediction-auto-settle | * * * * * | prediction-auto-settle |
| 4 | prediction-schedule-worker | * * * * * | prediction-schedule-worker |
| 5 | prediction-result-worker | */2 * * * * | prediction-result-worker |
| 6 | prediction-settle-worker | * * * * * | prediction-settle-worker |

### Key Design Decisions
1. Draw declaration is separate from refund execution
2. `result_selected` is a real reversible status between `live` and `confirmed`
3. `settled` means financially closed and immutable
4. Events group fights; admin manages at event level
5. Result worker only moves to `result_selected`, never `confirmed` — admin must confirm
6. Settlement worker uses job table with CAS guards for exactly-once execution
7. All workers respect both global kill switch AND per-event automation_paused flag
8. **approveEvent automatically enables auto_resolve** so workers pick up events immediately

### Admin Workflow (Fully Automated)
1. Ingest events from API (prediction-ingest)
2. Approve event in admin UI → sets auto_resolve: true, automation_status: scheduled
3. **Everything else is automatic:**
   - Schedule worker locks fights 60s before event
   - Schedule worker marks fights live at event start
   - Result worker detects outcomes from APIs
   - Admin confirms results (or high-confidence auto-confirms)
   - Settle worker closes markets after claims_open_at
   - Users claim SOL rewards

### Safety Guardrails
- **Global kill switches**: predictions_enabled, claims_enabled, automation_enabled
- **Per-event pause**: automation_paused flag
- Server-side status guards on all transitions
- Per-claim cap: 5 SOL, daily ceiling: 50 SOL
- 5-minute safety delay before claims open (3 min for bot)
- CAS guards on job pickup prevent double-processing

---

## Phase 4 (Next): Admin UI for Automation Monitoring
Dashboard showing automation_jobs status, failed jobs, retry counts, audit logs.
