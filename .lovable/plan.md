# Fight Prediction System — IMPLEMENTED

## What was built

A complete fight prediction market system for 1MGAMING on Solana:

### Database Tables
- `prediction_fights` — Fight events with pool tracking, status lifecycle
- `prediction_entries` — User prediction records with shares, claim tracking
- `prediction_admins` — Authorized admin wallets

### Edge Functions
- `prediction-admin` — Create fights, lock predictions, resolve winners
- `prediction-submit` — Submit predictions with 5% fee, tx verification
- `prediction-claim` — Claim rewards from hot payout wallet after 5-min delay
- `prediction-feed` — Live activity feed of recent predictions

### Frontend Pages
- `/predictions` — Fight cards with live odds, prediction input, live feed, claim flow
- `/predictions/admin` — Admin panel for fight lifecycle management

### Seed Data
Silvertooth Promotions card pre-loaded:
- Daniel Cabrera vs Nic Leboeuf (Main Event)
- Jacob Caron vs Kevin Franco-Flores
- John Deidouss vs Varinder Sidhu
- Yazane Elmoubtahil vs Derrel Perreira

### Key Features
- Share-based pool system with dynamic live odds
- 5% platform fee on all predictions
- Minimum 0.05 SOL prediction
- Realtime pool/odds updates via Supabase channels
- 5-minute claim delay after resolution
- Double-claim protection
- Admin wallet authorization

---

## Vault Architecture

### V1 (Current): Dedicated Hot Payout Wallet
The payout system uses a **dedicated hot wallet** (server-side keypair) with tight programmatic safety limits:

| Guardrail | Limit | Purpose |
|-----------|-------|---------|
| Per-claim cap | 5 SOL | Prevents single-exploit drain |
| Daily ceiling | 50 SOL | Limits total daily exposure |
| Balance pre-check | Required | Fails gracefully if wallet is underfunded |

The hot wallet should be funded only with the amount needed for near-term payouts. It is NOT a general-purpose server keypair — it is a purpose-limited payout wallet.

### V2 (Target): Program-Owned / PDA-Controlled Vault
Long-term, payouts should be handled by the Anchor program itself:
- Prediction pool funds held in a **PDA-controlled vault** derived from the fight ID
- Payouts authorized via **CPI** with on-chain winner verification
- Eliminates the need for any server-side keypair
- Full transparency: all payouts verifiable on-chain
- No single key can drain the vault — only the program logic controls withdrawals
