# Password setup and reset release

Welcome emails, administrator resets, and Forgot Password emails now open the same password form. New emails carry a recovery token hash in the URL fragment. The browser verifies it with `verifyOtp({ token_hash, type: 'recovery' })` only when the person submits matching passwords. No PKCE browser verifier is needed for new links. Opening or refreshing a link does not consume it.

Previously sent recovery hashes and PKCE recovery codes are supported. Invalid, used, and expired links show a replacement-link form. Password-policy failures allow retrying the password after verification without consuming the token again. The final Sign In button signs out before opening a fresh login screen.

## Release order

1. Merge this pull request and publish its frontend through the existing MJV/Bolt publishing process. Confirm the published bundle includes `account_token_hash` and the new password setup form.
2. Deploy `send-welcome-email`, `reset-user-password`, and `send-auth-email` from the merged source. The first two include `_shared/employee-account-email.ts`, `_shared/account-email-template.ts`, and `_shared/system-email.ts`. The Auth hook includes `_shared/system-email.ts`. Preserve their current JWT settings: welcome/reset enabled, signed Auth webhook disabled with signature validation in the function body.
3. Send a fresh welcome email to the affected employee from User Management. Have them save their password, select Go to Sign In, and log in with their account email. Confirm Account Activated appears after the password change. Provider acceptance is not proof of delivery or activation.
4. Verify Forgot Password through a controlled test account, including opening its email in a different browser. Do not use an employee's credentials or change their password administratively.

Do not deploy the new email functions before the frontend: the older published app cannot handle the new token-hash links. No database migration or permission changes are required.

## Validation

- `npm run test:account-emails` checks email authorization, transport/provider failures, signed hooks, link construction, activation tracking and token handling.
- `npm run test:account-emails:browser` builds the app and runs the actual React components, AuthProvider and Supabase SDK against intercepted Auth responses. It covers password mismatch, password-policy retry, fresh-browser welcome/reset, refresh, expired links, replacement requests, legacy implicit/PKCE links, sign-out and login using the saved password.
- The workflow runs both suites on pull requests affecting these flows.

Browser tests use controlled responses and do not send emails or modify production users. Actual email delivery and the deployed Supabase Auth configuration must be checked after publication.
