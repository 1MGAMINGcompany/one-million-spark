

# Add Payout Safety Guardrails + Update Architecture Notes

## Current State
The `prediction-claim` edge function uses a server-side keypair (`VERIFIER_SECRET_KEY_V2`) as the payout wallet. There are no per-claim or per-period limits — the function will send any calculated reward amount without checks.

## Plan

### 1. Add payout guardrails to `prediction-claim/index.ts`

Add three safety checks before executing the transfer:

- **Per-claim cap**: Reject any single payout exceeding a configurable max (e.g. 5 SOL for V1). This prevents a bug or exploit from draining the wallet in one call.
- **Balance check**: Before sending, verify the hot wallet balance is sufficient. Return a clear "insufficient vault funds" error instead of a failed transaction.
- **Daily payout cap** (lightweight): Query `prediction_entries` for total `reward_lamports` claimed today. If it exceeds a daily ceiling (e.g. 50 SOL), block further claims and alert.

### 2. Update plan.md with vault architecture notes

Document the current design as **V1: Dedicated Hot Payout Wallet** with tight limits, and note the long-term target of **V2: Program-Owned / PDA-Controlled Vault** where payouts are authorized by the Anchor program via CPI, eliminating the server keypair entirely.

### Files changed
- `supabase/functions/prediction-claim/index.ts` — Add per-claim cap, balance pre-check, daily cap
- `.lovable/plan.md` — Update vault architecture section

