
Issue identified:
- The admin page code is already using the correct client-side OTP API shape in `src/components/admin/AdminAuth.tsx`:
  - `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: undefined } })`
  - `supabase.auth.verifyOtp({ email, token, type: "email" })`
- The reason you still receive a login link is not the React component. It is the auth email content/configuration.
- I confirmed the project has no custom auth email setup in the repo:
  - no `auth-email-hook`
  - no auth email templates under `supabase/functions/_shared`
- I also confirmed there is currently no sender email domain configured for this workspace, so the project is falling back to the default passwordless email behavior, which is the magic-link template.

What to build:
1. Keep `src/components/admin/AdminAuth.tsx` functionally as-is, aside from optionally cleaning the misleading comment that says “magic link”.
2. Set up auth email infrastructure for this project so passwordless emails use a branded/custom template instead of the default.
3. Replace the default passwordless email template content so it includes the 6-digit token (`{{ .Token }}`) rather than a login button/link.
4. Deploy the auth email hook/templates so `signInWithOtp` emails render as code-based OTP emails.
5. Verify the admin flow end-to-end:
   - enter admin email
   - receive 6-digit code email
   - enter code
   - gain access

Technical details:
- Supabase/Lovable passwordless email OTP and magic link share the same send API.
- The difference is mainly the email template content:
  - magic link template uses confirmation URL/button
  - OTP template must include `{{ .Token }}`
- Since this project currently has no custom auth email templates and no configured email domain, code changes in `AdminAuth.tsx` alone cannot change the email body from link to code.

Implementation sequence:
1. Configure a sender email domain for the project.
2. Scaffold auth email templates.
3. Update the magic-link/passwordless auth template to show a 6-digit code using `{{ .Token }}` and remove the login-link CTA.
4. Deploy the auth email template handler.
5. Test the `/predictions/admin` flow with `morganlaurent@live.ca`.

Expected outcome:
- Admin login UI stays the same.
- Email content changes from “One-time login link” to a code-based OTP email.
- The existing code entry box on the admin page will then match the email users receive.

Blocker:
- I cannot complete the OTP-email fix until the project has an email domain configured, because there is currently no email domain in this workspace.

Next implementation plan once domain is available:
```text
AdminAuth.tsx
  -> send OTP request
  -> user receives custom auth email with {{ .Token }}
  -> verifyOtp(type: "email")
  -> 24h admin session
```
