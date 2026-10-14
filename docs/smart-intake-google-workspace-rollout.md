# Google Workspace rollout: Electronic Life

Existing Google Workspace accounts:
- support@electroniclife.com: support and internal task triage
- leads@electroniclife.com: sales lead triage

Do not alter MX records, mailbox ownership, or existing user forwarding. In Google Workspace Admin Console, an authorized admin can configure a recipient-scoped routing rule to add a copy recipient at the verified MJV ingestion destination while preserving normal delivery. Exact controls vary by Workspace configuration; test against the tenant's existing forwarding and groups before enabling.

## Prerequisites
1. Deploy and verify an authenticated provider ingress that persists the complete message before acknowledging delivery, including blank messages and attachments.
2. Provision and verify two distinct MJV intake destinations, each mapped to exactly one dealer and a purpose (support or sales).
3. Validate recipient routing with a test message; verify the original sender, To/Cc, Message-ID, body, attachments, and timestamps survive forwarding.
4. Establish a stable deduplication key across provider retries and Google Workspace routing copies.
5. Test internal forwards and message loops; prevent MJV's outbound notifications from being re-ingested.
6. Initially enable read-only classification/review without customer auto-replies or automatic contact creation.
7. Confirm existing employees still receive all mail and can reply as before.
8. Provide rollback: disable the extra copy routing rule; existing mailboxes remain unchanged.

## Operational notes
A Google Workspace route can deliver a copy to MJV, but messages blocked upstream before that route may not reach MJV. Never claim history proves a sender did not send a message. Provider delivery logs and Workspace Email Log Search are separate diagnostic sources.

No admin-console changes have been performed. The current Smart Intake edge function is not ready to receive this live traffic.
