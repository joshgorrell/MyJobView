# Punchlist expiration reminder rollout

The customer checkbox in ContactDetail controls contacts.punchlist_expiration_emails_enabled.

The database has a reminder-candidate function and delivery log. These do not send email.

Before activating reminders:
1. Implement a server-side worker with organization-specific verified sender settings.
2. Authorize invocation using a secret unavailable to the browser.
3. Claim each reminder atomically using the unique (grant_id, reminder_stage, expiration_date) key.
4. Recheck customer opt-out and current entitlement immediately before delivery.
5. Record provider response and retry failed sends safely.
6. Test Test & Tune, paid VIP, comped VIP, renewal, opt-out, and duplicate cases.
7. Only then schedule the worker.

Do not turn on a scheduled email job until the above checks pass.
