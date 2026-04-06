
What I confirmed

- The wallet case fix is already in place: both `src/pages/platform/OperatorApp.tsx` and `src/pages/FightPredictions.tsx` now query `prediction_entries` with `address.toLowerCase()`.
- That explains why `My Picks (2)` now appears: the wallet lookup is working.
- The remaining issue is not the wallet query anymore. It is a separate display/parity problem.

Exact root causes

1. `My Picks` count and `My Picks` cards come from different datasets.
- In `src/pages/platform/OperatorApp.tsx`, the tab label uses `userEntries.length`.
- But the cards are rendered from `filteredFights`, which comes from `operatorFights`.
- `operatorFights` only includes fights that are currently:
  - `open`, `live`, or `locked`
  - have a valid `event_date`
  - pass operator sport validation
  - survive stale/old-event cutoffs
- So the UI can correctly count 2 entries while showing zero cards if those entries belong to fights that are no longer in the active event feed.

2. The operator app is still applying event-browsing filters inside `My Picks`.
- In picks mode, the code still applies:
  - broad sport filter
  - league filter
  - time filter
  - search query
- Your screenshot shows a Baseball league filter active while you said the new prediction was NHL.
- That means the pick can exist and still be hidden before rendering.

3. Operator `My Picks` is not scoped to the current operator app.
- `loadUserEntries()` fetches all entries for the wallet:
  - no `source_operator_id` filter
  - no current-operator scoping
- So `/demo` can count entries from other operator apps or flagship, while the rendered fight list only knows about the current operator feed.
- Even when the count happens to be “correct,” this is still a real mismatch in the implementation.

4. The balance banner is not guaranteed to read the same address the backend debits.
- `OperatorApp` shows balance from `usePolygonUSDC()`.
- `usePolygonUSDC()` reads only `walletAddress` from `usePrivyWallet()`, which prefers the smart wallet.
- But `prediction-submit` can debit either:
  - `wallet` (smart wallet), or
  - `wallet_eoa`
  depending on which address actually has allowance.
- So the trade can succeed while the banner keeps watching the wrong address.

5. The current “Balance” UI is only a liquid-wallet read, not a full trading-balance view.
- It does not reconcile:
  - which address was actually charged
  - liquid USDC.e vs funds moved for trading
  - any “in play” exposure
- High-confidence conclusion: this is why the number can stay unchanged even after a successful prediction.

Smallest safe fix plan

Phase 1 — highest impact, lowest risk
- Fix `My Picks` on operator apps to render from the user’s actual entry history, not from the active event browse feed.
- Fetch the fights by the user’s `fight_id`s so picked events still appear even if they are no longer `open/live/locked`.
- Scope operator `My Picks` to the current operator app.
- Make the badge count use the exact same scoped dataset that the tab renders.
- Stop applying browse filters to `My Picks`, or reset them when switching tabs.

Phase 2 — balance parity
- Align the displayed balance source with the same smart-wallet/EOA resolution used by `prediction-submit`.
- Refetch balance immediately after a successful submit, not only on the 15s poll.
- If needed, relabel the banner so it reflects what is actually being shown: liquid USDC.e, not total funds in play.

Phase 3 — optional polish
- Split `My Picks` into Open / Live / Settled / Claimed sections.
- Add a small notice when user filters are hiding picks.
- Optionally add a separate “funds in play / portfolio” summary for better Polymarket-style clarity.

What NOT to touch
- Do not change payout logic.
- Do not change claim logic.
- Do not change settlement/reconciliation.
- Do not change auth, routing, or operator theme logic.
- Keep the fix isolated to:
  - operator `My Picks` data loading/rendering
  - operator balance source/display parity
