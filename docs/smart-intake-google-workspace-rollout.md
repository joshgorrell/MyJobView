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

## Exact staging setup (do not enable customer traffic yet)

1. In Resend, create an inbound receiving address/domain for the staging environment. Resend supports receiving addresses under a hosted `@<id>.resend.app` domain. Reserve two **different** addresses, e.g. `support-mjv@<id>.resend.app` and `leads-mjv@<id>.resend.app`. Use the actual assigned domain, not these placeholders.
2. In MJV's staged `intake_destinations` table, create one `email` / `resend` destination per receiving address for the correct Electronic Life organization and office, with `purpose='support'` or `purpose='sales'`. Start with `enabled=false`. Verify the destination belongs to exactly one dealer before setting `verified_at` and enabling it. Do not use a shared alias across dealers.
3. In Resend, register the deployed Supabase Edge Function HTTPS URL for `email.received` events. Configure its signing secret as `SMART_INTAKE_EMAIL_WEBHOOK_SECRET`, and a restricted Resend API key as `RESEND_API_KEY`. Configure `SMART_INTAKE_EMAIL_PROVIDER=resend`. Keep `SMART_INTAKE_EMAIL_ENABLED=false` until the full release gate passes. Never place these secrets in the Vite frontend or documentation.
4. In Google Admin Console (with appropriate admin rights), open **Apps → Google Workspace → Gmail → Routing**. Create an organization-scoped rule applying only to inbound messages addressed to `support@electroniclife.com`. Use **Add more recipients** (or the equivalent additional-recipient routing option) to deliver an **additional copy** to the verified support Resend address. Keep normal delivery and all existing forwarding intact. Repeat with a separate rule for `leads@electroniclife.com`, using the sales Resend address. Avoid replacing the original recipient or changing MX records. Review rule precedence and any existing routing/forwarding rules.
5. First test with synthetic messages sent from external accounts, separately to support and leads. Confirm normal staff delivery and exactly one tenant-mapped Smart Intake record per message. Test a sender with a display name, HTML-only content, blank body, attachments, duplicate webhook deliveries, forwarding loops, and messages addressed to both mailboxes. Validate Resend receipt logs, Supabase processing records, and Google Workspace Email Log Search. **Do not enable production copies while attachments, staff RLS, and background recovery are incomplete.**
6. Rollback: disable only the two additional-recipient routing rules, disable `SMART_INTAKE_EMAIL_ENABLED`, and disable both `intake_destinations`. Existing Google Workspace mail delivery remains in place.

### Important limitations

The staged webhook currently rejects messages with unprocessed attachments and relies on provider redelivery for content retries. It does **not** yet support a durable recovery worker, attachment scanning, or live authorized staff access to the new intake tables. Its successful response only confirms receipt/content persistence, **not** service request creation, lead creation, or notification delivery. These are release blockers, not instructions to bypass.
