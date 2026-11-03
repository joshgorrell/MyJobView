# System email rollout

All application email producers now call `_shared/system-email.ts`: Resend HTTPS API, the existing `RESEND_API_KEY`, and the existing configured company sender. Prepared company senders are preserved, including on idempotent retries; missing or Resend test senders resolve from company settings. Content, recipients, CC/BCC, attachments, custom reply-to addresses, and idempotency keys are preserved. Missing provider credentials no longer count as a successful email. SMS paths are unchanged.

## Confirmed reset defect

Admin UserManagement posted `{email}` to `reset-user-password`, but the deployed function required `{email,password}` and performed a direct password change. It did not attempt email delivery. Welcome email separately used `onboarding@resend.dev`, constructed an invalid login URL, and returned success when no provider was configured.

## Deployment order

1. Apply `20261005180043_employee_welcome_email_tracking.sql`. It creates admin-readable, tenant-scoped send status and an Auth password-change activation trigger. Only service-role writes are allowed; the private trigger function is not publicly callable.
2. Deploy every function below. Shared modules are bundled separately into each Edge Function, so deploying only welcome/reset does not update the other email functions.
3. Keep the existing `RESEND_API_KEY` and company email settings. Do not switch to Supabase default SMTP or Resend's test sender. The current project is configured with `sales@electroniclife.com` and `https://myjobview.com`. Sender verification still belongs to the existing Resend account.
4. Ensure Supabase Auth allows `https://myjobview.com/` and `https://myjobview.com/?account_setup=welcome` (or equivalent configured application URLs). The welcome function fails explicitly if Auth silently substitutes another redirect.
5. Deploy the frontend. New-user creation leaves welcome sending to the confirmation modal; existing users have Send/Resend Welcome and Password Reset actions.
6. To also route Supabase-managed login recovery, confirmation, invitation, magic-link, email-change, reauthentication, and security notifications through the same sender, configure the **Send Email Hook** in Supabase Auth Hooks. Use the `send-auth-email` function URL and copy its generated signing secret into Edge Function secret `SEND_EMAIL_HOOK_SECRET`. Deploy this function with JWT verification disabled as specified in `config.toml`; it verifies Standard Webhooks signatures and timestamp windows itself. Enable the hook only after the secret exists and a signed test succeeds. Email provider must remain enabled. The connector used for this change does not expose Auth hook configuration or secret updates, so this dashboard step is required.
7. Test a welcome and login-page reset using a controlled recipient. Verify provider acceptance in Resend, receipt of the message, the one-time link, password creation, and activation status. Then resend welcome to the intended employees.

## Functions requiring redeployment

- `create-user`
- `lost-opportunity-review`
- `reset-user-password`
- `security-recurring-billing`
- `send-auth-email`
- `send-change-order-email`
- `send-contract-invitation`
- `send-deposit-reminder`
- `send-invoice-email`
- `send-job-completion-survey`
- `send-kiosk-thank-you`
- `send-lead-notification`
- `send-mileage-reminder`
- `send-mjv-feedback`
- `send-paparazzi-photos-notification`
- `send-paparazzi-request`
- `send-payment-receipt`
- `send-portal-magic-link`
- `send-proposal-email`
- `send-proposal-question-email`
- `send-punchlist-invite`
- `send-review-followup-job`
- `send-review-request`
- `send-satisfaction-alert`
- `send-satisfaction-email`
- `send-time-request-notification`
- `send-welcome-email`
- `send-work-order-feedback`
- `send-work-order-reminder`

## Status semantics

“Sent” means Resend accepted the message; it does not claim inbox delivery. No delivery/bounce webhook is added in this change. The first password change after a welcome email records activation (including an explicit admin password update). Earlier activation history is not backfilled. Send failures show the provider/configuration error, and accepted-but-untracked sends show a warning to avoid blind resending. No password or setup token is stored in the status table or logged.

## Verification

Run `npm run test:account-emails`, `npm run test:security-onboarding`, `npm run test:reviews`, and `npm run build`. The account-email tests cover privilege checks, tenant status RLS, configuration/provider failures, successful send tracking, one-time link routing, Auth recovery initialization, transport consistency, attachments/idempotency, real webhook signatures, and the reversed old/new hash mapping in secure email changes.

Supabase Auth hook reference: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
