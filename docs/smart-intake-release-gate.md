# Smart Intake release gate — October 2026

## Current decision: HOLD

Draft PR #185 must remain unmerged. Do not enable SMART_INTAKE_EMAIL_ENABLED or change Google Workspace routing.

### Required before isolated staging email pilot
- Replace x-webhook-secret placeholder with provider-native, replay-resistant signature verification against the exact raw body.
- Retrieve the full email through an authenticated provider API using the receipt email_id; preserve original body and attachment metadata securely. The receipt webhook is metadata only.
- Add durable retry and reconciliation for incomplete content and missing audit events.
- Confirm all migrations against actual database schema, including organization and office foreign keys, unique constraints and task classification.
- Implement tenant- and Service Center-scoped staff RLS for history, timeline and notification preferences. Verify negative cross-tenant tests.
- Confirm classification writes to the existing unassigned Service Request Queue, tasks and leads, without automatically creating incomplete contacts.
- Integrate per-user opt-in notifications with deduplication.
- Run build, typecheck, migration tests, contract tests, mobile UI checks and end-to-end inbound-email tests.

### Required before production publication
- Pass a controlled staging pilot using dedicated verified aliases and test messages.
- Verify duplicates, missing body, attachment scanning, ambiguous recipients, failures, retries and audit continuity.
- Keep existing Google Workspace MX, mailboxes and employee forwards working.
- Obtain explicit deployment and routing approval after review.

### Test status
The repository includes a lightweight receipt contract test runnable with npm run test:smart-intake. Its presence does not establish a passing result. No successful end-to-end test or live pilot is confirmed.
