
Issue identified:
- `src/components/admin/AdminAuth.tsx` already sends the login email with `emailRedirectTo: ${window.location.origin}/predictions/admin`.
- The URL you pasted — `#error=access_denied&error_code=otp_expired` — means the one-time auth token is already invalid before the app can create a session.
- I also confirmed there is no existing hash/error handling anywhere in the app, and no dedicated auth callback route. So when auth fails, the user just lands on the site root with a raw error hash.
- Because the failure lands on `https://1mgaming.com/` instead of `/predictions/admin`, the redirect is likely falling back to the auth default Site URL rather than the intended admin path.
- With `morganlaurent@live.ca`, Microsoft/Outlook link scanning is also a likely contributor: these scanners often open single-use magic links before the user does, which causes `otp_expired`.

What to build:
1. Keep the admin flow as magic-link based.
2. Update `src/components/admin/AdminAuth.tsx` so it:
   - uses an explicit production admin redirect target for live traffic
   - reads URL hash errors on load
   - shows a clear “link expired or already used — request a new one” message instead of silently dropping the user on `/`
   - clears the bad hash after handling it
3. Add a dedicated admin auth callback route if needed so magic-link returns go through one stable page before the dashboard renders.
4. Update auth redirect configuration so the exact admin URL is allowed:
   - `https://1mgaming.com/predictions/admin`
   - testing URLs for preview/published environments as needed
5. Re-test the flow end-to-end with a freshly generated link.

Technical details:
- `otp_expired` is an auth-layer failure, not a React route bug by itself.
- Missing/invalid allowed redirect URLs can cause fallback to the root Site URL.
- Single-use magic links are vulnerable to Outlook/Microsoft link prefetching, which can invalidate the token before the real click.

Implementation sequence:
1. Harden `AdminAuth.tsx` around redirect target selection and auth error/hash handling.
2. Optionally add a small callback route in `src/App.tsx` if a dedicated landing point is needed.
3. Verify backend auth settings include the exact admin redirect URL.
4. Test with a brand-new email on production.
5. If `otp_expired` still happens even with correct redirects, treat Microsoft link scanning as the remaining blocker and move this admin login away from single-use links.

Expected outcome:
- Successful admin links land on `/predictions/admin`.
- Failed/consumed links show a clear resend state instead of a confusing root-page error URL.
- The admin dashboard only opens after the email is validated against `prediction_admins` and the local 24-hour admin session is created.
