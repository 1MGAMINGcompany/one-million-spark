# Fight Prediction System — Phase 1 Complete

## Status Lifecycle (Final)

```
open → locked → live → result_selected → confirmed → settled
                   └→ draw → refund_pending → refunds_processing → refunds_complete
                   └→ cancelled
```

## Architecture

### Database Tables
- `prediction_events` — Parent event grouping (name, org, date, location, auto_resolve, is_test)
- `prediction_fights` — Individual fights with event_id FK, weight_class, fight_class, method, refund tracking
- `prediction_entries` — User prediction records
- `prediction_admins` — Authorized admin wallets
- `prediction_settings` — Global kill switches (predictions_enabled, claims_enabled, automation_enabled)

### Edge Functions
- `prediction-admin` — Full lifecycle + getSettings/updateSettings for kill switches
- `prediction-refund-worker` — Separate refund execution for draw scenarios (idempotent, safety-guarded)
- `prediction-submit` — Submit predictions with 5% fee (respects predictions_enabled kill switch)
- `prediction-claim` — Claim rewards (respects claims_enabled kill switch)
- `prediction-feed` — Live activity feed
- `prediction-auto-settle` — Cron auto-settle (respects automation_enabled kill switch)

### Key Design Decisions
1. Draw declaration is separate from refund execution (draw → refund_pending → refunds_processing → refunds_complete)
2. `result_selected` is a real reversible status between `live` and `confirmed`
3. `settled` means financially closed and immutable
4. Events group fights; admin manages at event level
5. `review_required` + `review_reason` fields ready for Phase 2 automation

### Safety Guardrails
- Server-side status guards on all transitions
- Red confirmation dialogs for irreversible actions (lock, confirm, settle, draw, refunds)
- Per-claim cap: 5 SOL, daily ceiling: 50 SOL
- 5-minute safety delay before claims open
- Refund tracking: refund_status, refunds_started_at, refunds_completed_at

### Seed Data
- Silvertooth Promotions event (Montreal) — linked to existing fights
- 3 TEST events (BOXING, MMA, MUAY THAI) with 2 fights each

---

## Phase 2 (Next): Event Discovery Bot
Requires Firecrawl connector for web scraping of Tapology/BoxRec/Sherdog.

## Phase 3 (Next): Auto Result Detection
Multi-source confidence system for automated resolution.
