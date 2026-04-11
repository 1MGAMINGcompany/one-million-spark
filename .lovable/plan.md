
Goal: make the operator apps usable today without redesigning the trading system.

What I confirmed
- The operator apps really do not have a logout/sign-out control right now. `src/pages/platform/OperatorApp.tsx` only shows the truncated wallet address in the navbar. The logout pattern already exists elsewhere (`src/pages/platform/LandingPage.tsx`, `src/components/PrivyLoginButton.tsx`) but is not used in the operator app.
- I did inspect the 2 failed tests. Both latest trades from wallet `0x3ed68845cf4528c80ff62094b52eeabca29db5a4` failed the same way:
  - `6eacc059-b4dd-4ccd-afee-de6c3d047be9` — created `20:07:18`, failed `20:07:26` (~8s)
  - `91b5e04b-1858-484f-8496-8a8c4fb100ce` — created `20:09:19`, failed `20:09:27` (~8s)
- Both failures were `clob_rejected` with `{"error":"Unauthorized/Invalid api key"}`.
- Audit records show `failure_class = retry_rejected` on both tests.
- Backend automation logs show browser-derived credentials were successfully saved during those attempts, and the current session is already `active` with fresh credentials saved at `20:09:25`.

What that means
- The long hidden wait is mostly fixed now.
- The current blocker is no longer stale pre-April credentials.
- The current blocker is: fresh browser-derived credentials are still being rejected when the browser POSTs `/order`.
- So the toast telling you to sign out and sign back in is actionable only after we add the button, but logout alone is unlikely to solve the real issue.

Most likely remaining blocker
- `src/lib/clobOrderClient.ts` is still submitting orders in a way that does not fully match Polymarket’s documented auth model:
  - it uses `signatureType: 0`
  - it uses `owner: account.address`
  - it does not send `POLY_ADDRESS`
  - it submits with `orderType: "GTC"`
- Polymarket’s docs require the full L2 header set and correct `signatureType`/`funder` handling for proxy/safe-style users.
- The project’s own verifier (`supabase/functions/pm-verify-credentials/index.ts`) already uses a different auth model than the browser submitter, which is the biggest red flag.

Plan
1. Add the missing sign-out control
- Update `src/pages/platform/OperatorApp.tsx` to include a visible logout button next to the connected wallet, reusing the existing logout flow already used on the landing page.
- Keep it available on mobile and desktop so the current recovery message is no longer a dead end.

2. Align browser order submission with Polymarket’s documented auth model
- Update `src/lib/clobOrderClient.ts` so the browser submit path sends the full documented L2 auth headers, including `POLY_ADDRESS`.
- Stop assuming plain EOA mode if the session is actually using proxy/safe-style execution.
- Align `signatureType`, `funder`/owner handling, and order-post format with the documented model already mirrored by `pm-verify-credentials`.

3. Return the right execution metadata to the browser
- Update `supabase/functions/prediction-submit/index.ts` so the browser gets every field it needs for the correct auth mode instead of inferring from `trading_key` alone.
- Keep fee collection, records, reconciliation, and operator attribution exactly as they are.

4. Make the next $1 test conclusive
- Extend diagnostics in `src/lib/clobOrderClient.ts` and the confirm/audit path so the next real test records:
  - exact `/order` status/body
  - whether `POLY_ADDRESS` was sent
  - `signatureType`
  - funder/owner used
  - order type used
- That way one fresh test will tell us whether the blocker is:
  - auth header mismatch
  - wrong signature type/funder
  - bad order payload
  - or a true exchange-side rejection

5. Do only targeted cleanup if needed
- I would not do another broad credential reset first.
- If the auth-model patch changes required session metadata, then clear only the affected session and let it re-derive once.

Exact files to change
- `src/pages/platform/OperatorApp.tsx`
- `src/lib/clobOrderClient.ts`
- `supabase/functions/prediction-submit/index.ts`
- `supabase/functions/prediction-confirm/index.ts`
- Possibly `src/components/predictions/EnableTradingBanner.tsx` if we also want to soften the current “sign out/sign back in” wording

What stays unchanged
- Browser derives credentials
- Browser signs and submits orders locally
- Backend keeps fee collection, trade records, reconciliation, and operator attribution
- No switch back to shared platform execution

Bottom line
- Yes, I saw what went wrong in the 2 failed tests.
- They failed after fresh browser credentials were saved, so the remaining blocker is not “missing API key config” and not just “you need a logout button.”
- The operator app is missing the logout button, and I would add that immediately.
- As of right now, I would not say a fresh user session can reliably place a real $1 prediction today until the browser `/order` auth model is patched.
