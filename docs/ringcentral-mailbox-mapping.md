# RingCentral mailbox mapping

## Result

Dealer Admin → Integrations → RingCentral can discover provider destinations, enable selected voicemail mailboxes, assign a department and primary owner, add responsible/backup recipients, choose email alerts per recipient, and set the backup delay. Discovery does not alter RingCentral call routing or enable new mailboxes. Announcements and IVR destinations may forward voicemail elsewhere; only enable actual voicemail destinations after the provider read check succeeds.

The selected mailbox department wins over AI topic classification. The original AI department is retained for review. Staff can listen to audio/read transcripts in the existing Flow voicemail tab and create a native service request with an atomic, duplicate-protected link. Contact matching is tenant-scoped across phone/mobile/business phone; ambiguous callers remain unlinked.

## Deployment order

1. Apply `20261116162611_ringcentral_mailbox_mapping.sql`.
2. Deploy `ringcentral-mailbox-mapping`, `ringcentral-webhook-subscription`, `ringcentral-subscription-renewal`, `ringcentral-voicemail-webhook`, `process-phone-voicemail`, `drain-phone-voicemail-queue`, and `phone-voicemail-inbox` with the shared modules in this commit.
3. Publish the frontend. Existing enabled mailboxes and grants are preserved; discovered mailboxes start disabled. No customer mailbox is automatically enabled by this migration.
4. Discover destinations using the existing RingCentral authorization. Discovery or reading another mailbox can require additional provider/account permissions; a connected badge alone does not establish that access.
5. Confirm actual destination(s) and save mappings. For Electronic Life, Bobbi should handle Service/Support and Security, with email enabled for her if desired. Do not guess numeric API mailbox IDs from dialable extension numbers. No backup recipient is selected automatically.
6. Saving a mapping checks message-store read permission, commits the mapping and grants, then synchronizes the MJV-owned voicemail subscription to all enabled mailboxes. Subscription failures are shown separately so saved configuration is not mistaken for working delivery. Daily renewal handles all enabled mailboxes and never creates a missing subscription silently.
7. Leave one real test voicemail for each enabled destination. Confirm one stored message, the correct owner/department, one notification/email per selected recipient, readable recording/transcript, and one linked service request. Run Import last 14 days for selected destinations to recover prior messages; repeated imports preserve existing state and deduplicate by provider message identity.

## Delivery and access

- Recipients must be active employees in the same organization with MJV access enabled. Saving a mapping explicitly grants the selected department to those recipients. Removing a mailbox mapping does not revoke independent department access; use the existing department-access controls for revocation.
- A mailbox's primary owner is recorded on new voicemails. Other responsible recipients receive the same department alert. Backup recipients are alerted after the configured elapsed minutes while the voicemail is new/assigned; in-progress/completed or linked requests stop escalation. Timing follows the existing bounded two-minute queue reconciliation sweep.
- Missing/disabled responsible recipients fall back to active same-tenant administrators. Low-confidence/unclassified review messages are retained. Quarantined spam does not notify staff.
- Email contains a generic alert and authenticated Flow link, with no transcript, recording, or caller details. The existing company sender settings and system-email transport are reused. Provider acceptance is tracked, not inbox delivery confirmation. Failed/uncertain counts are visible in mapping settings.
- A service-only claim and stable provider idempotency key protect retries/concurrency. Attempts stop after five tries; ambiguous attempts older than 23 hours require review rather than resending beyond the provider's idempotency window.
- RingCentral account `~` webhook aliases are accepted only when the extension resolves to exactly one enabled stored mailbox; its canonical account ID is persisted. Explicit foreign accounts and ambiguous aliases fail closed.

## Record lifecycle

Mailbox recipient rows are owned by their mailbox and cascade on deletion. Email receipts are owned by voicemail and cascade on deletion. Deleting a voicemail removes its tenant-scoped `phone_voicemail` notifications and Flow snapshots transactionally. Independent service requests survive with their voicemail source cleared. Deleting a linked service request clears the voicemail's request pointer. Already-sent email copies remain with the recipient/provider; recordings continue to use the existing private storage lifecycle. No new audio or transcript copies are created by this change.

## Validation

`node --test tests/phone-dispatcher/*.mjs` covers routing, provider pagination/subscriptions, documented alias delivery, ACL fallback, recipient/tenant isolation, email idempotency, atomic service-request linkage, cleanup, and rollback. `node tests/phone-dispatcher/browser/mailbox-mapping.mjs` checks editing, email/backup assignment, subscription synchronization, recovery imports, and overflow at 320/375/390/430/1280px. The workflow installs Chromium and runs both suites with the frontend typecheck.
