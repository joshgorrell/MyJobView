# Employee welcome onboarding

After a welcomed employee sets their password and signs in, a three-step modal offers a profile photo, the same six personal notification preferences as Preferences, and a final review. Device notifications require an explicit button click. Existing browser alerts can be turned off. Users can finish or skip; either choice is remembered across browsers and normal password resets. Existing activated welcome accounts also receive this setup once.

Profile and existing business-card photos stay aligned. Photo selection uses a local preview and uploads only on Finish. Completion, profile photo and notification choices save in one database transaction under the signed-in user's existing RLS permissions. Failed saves retain draft choices; unused uploads are cleaned up only after checking whether the profile references them.

## Release

The additive `20261014161542_employee_welcome_onboarding.sql` migration is applied to MJV. It adds an RLS-protected eligibility/completion table and a SECURITY INVOKER completion RPC, and extends the existing private password-setup trigger while preserving account activation tracking. No employee credentials or notification preferences were modified during deployment.

Merge this PR and publish the frontend in Bolt. No new email-function deployment is needed: the password setup/reset functions were deployed previously. Send a fresh welcome email through User Management when the employee is ready to test the complete flow.

The modal is limited to active employee profiles after welcome-password activation. Customer portal users, password-recovery screens and accounts with no activated welcome email do not receive it. Completion does not reappear after a normal reset. Preferences remain editable from the existing profile page.

## Verification

- `npm run test:welcome-onboarding`: SQL activation gating, RLS isolation, protected eligibility, settings whitelist, transaction rollback, finish/skip durability and push opt-in/persistence checks.
- `npm run test:welcome-onboarding:browser`: mobile and desktop layouts, keyboard focus, six shared notification settings, browser-alert denial, photo previews/uploads, save failures and retry, completion/skip and welcome-only gating.
- Account-password regression tests remain unchanged and pass.
